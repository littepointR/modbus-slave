import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'
import { AddressInfo } from 'net'
import { IPC_CHANNELS, IpcChannel } from '@shared'
import { invokeIpcHandlerUnsafe, listRegisteredIpcHandlers } from './ipc'

const CLI_API_FILENAME = 'cli-api.json'
const MAX_BODY_SIZE_BYTES = 1024 * 1024

interface CliApiConnectionInfo {
  host: string
  port: number
  token: string
  pid: number
  startedAt: string
}

interface InvokeRequestBody {
  channel: string
  args?: unknown[]
}

interface UiActionRequestBody {
  action: string
  payload?: Record<string, unknown>
}

interface CliApiOptions {
  dispatchUiAction?: (action: string, payload?: Record<string, unknown>) => Promise<unknown>
}

class CliApiServer {
  private server: Server | null = null
  private token = ''
  private infoFilePath = ''
  private readonly knownChannels = new Set<string>(IPC_CHANNELS)
  private options: CliApiOptions = {}

  async start(app: Electron.App, options: CliApiOptions = {}): Promise<void> {
    if (this.server) return

    this.options = options
    this.token = randomBytes(24).toString('hex')
    this.infoFilePath = join(app.getPath('userData'), CLI_API_FILENAME)
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res)
    })

    await new Promise<void>((resolve, reject) => {
      this.server?.listen(0, '127.0.0.1', () => resolve())
      this.server?.once('error', reject)
    })

    const address = this.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start CLI API server')
    }

    await this.writeConnectionInfo({
      host: '127.0.0.1',
      port: (address as AddressInfo).port,
      token: this.token,
      pid: process.pid,
      startedAt: new Date().toISOString()
    })
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve())
      })
      this.server = null
    }

    if (!this.infoFilePath) return

    try {
      await fs.unlink(this.infoFilePath)
    } catch {
      // Ignore removal errors; stale file gets overwritten on next startup.
    }
  }

  private isAuthorized(req: IncomingMessage): boolean {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false

    const token = authHeader.slice('Bearer '.length).trim()
    const actual = Buffer.from(token)
    const expected = Buffer.from(this.token)
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

    if (method === 'GET' && url.pathname === '/health') {
      this.respondJson(res, 200, {
        ok: true,
        channels: listRegisteredIpcHandlers().length
      })
      return
    }

    if (!this.isAuthorized(req)) {
      this.respondJson(res, 401, { ok: false, error: 'Unauthorized' })
      return
    }

    if (method === 'GET' && url.pathname === '/channels') {
      this.respondJson(res, 200, {
        ok: true,
        channels: listRegisteredIpcHandlers()
      })
      return
    }

    if (method === 'POST' && url.pathname === '/invoke') {
      await this.handleInvoke(req, res)
      return
    }

    if (method === 'POST' && url.pathname === '/ui/action') {
      await this.handleUiAction(req, res)
      return
    }

    this.respondJson(res, 404, { ok: false, error: 'Not Found' })
  }

  private async handleInvoke(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let rawBody = ''
    try {
      rawBody = await this.readBody(req)
    } catch (error) {
      this.respondJson(res, 413, {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to read request body'
      })
      return
    }

    let body: InvokeRequestBody

    try {
      body = JSON.parse(rawBody) as InvokeRequestBody
    } catch {
      this.respondJson(res, 400, { ok: false, error: 'Invalid JSON body' })
      return
    }

    if (!body.channel || !this.knownChannels.has(body.channel)) {
      this.respondJson(res, 400, { ok: false, error: 'Unknown IPC channel' })
      return
    }

    const args = body.args ?? []
    if (!Array.isArray(args)) {
      this.respondJson(res, 400, { ok: false, error: 'args must be an array' })
      return
    }

    try {
      const result = await invokeIpcHandlerUnsafe(body.channel as IpcChannel, args)
      this.respondJson(res, 200, { ok: true, result })
    } catch (error) {
      this.respondJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async handleUiAction(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.options.dispatchUiAction) {
      this.respondJson(res, 400, { ok: false, error: 'UI action dispatcher not configured' })
      return
    }

    let rawBody = ''
    try {
      rawBody = await this.readBody(req)
    } catch (error) {
      this.respondJson(res, 413, {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to read request body'
      })
      return
    }

    let body: UiActionRequestBody
    try {
      body = JSON.parse(rawBody) as UiActionRequestBody
    } catch {
      this.respondJson(res, 400, { ok: false, error: 'Invalid JSON body' })
      return
    }

    if (!body.action) {
      this.respondJson(res, 400, { ok: false, error: 'Missing action' })
      return
    }

    try {
      const result = await this.options.dispatchUiAction(body.action, body.payload)
      this.respondJson(res, 200, { ok: true, result })
    } catch (error) {
      this.respondJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      let totalBytes = 0

      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length
        if (totalBytes > MAX_BODY_SIZE_BYTES) {
          reject(new Error('Request body too large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  private respondJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(payload))
  }

  private async writeConnectionInfo(payload: CliApiConnectionInfo): Promise<void> {
    await fs.writeFile(this.infoFilePath, JSON.stringify(payload, null, 2), 'utf8')
  }
}

const cliApiServer = new CliApiServer()

export const startCliApiServer = async (app: Electron.App): Promise<void> => {
  await cliApiServer.start(app)
}

export const startCliApiServerWithOptions = async (
  app: Electron.App,
  options: CliApiOptions
): Promise<void> => {
  await cliApiServer.start(app, options)
}

export const stopCliApiServer = async (): Promise<void> => {
  await cliApiServer.stop()
}
