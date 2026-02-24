import fs from 'fs'
import path from 'path'
import type {
  AppendSystemLogParams,
  SystemLogEntry,
  SystemLogLevel,
  SystemLogSource,
  SystemLogStats
} from '@shared'
import type { Windows } from '@shared'

const LEVELS: SystemLogLevel[] = ['debug', 'info', 'warn', 'error']
const SOURCES: SystemLogSource[] = [
  'system',
  'comm',
  'script',
  'connection',
  'register',
  'workspace',
  'cli'
]

export class SystemLogger {
  private _entries: SystemLogEntry[] = []
  private _entrySizes: number[] = []
  private _bufferBytes = 0
  private _maxBufferBytes = 100 * 1024 * 1024
  private _nextId = 0
  private _windows: Windows
  private _logDir: string
  private _logFile: string
  private _fileLimitBytes = 10 * 1024 * 1024
  private _maxLogFiles = 5

  constructor(windows: Windows, logDir: string) {
    this._windows = windows
    this._logDir = logDir
    this._logFile = path.join(logDir, 'system.log')
    this._ensureLogDir()
  }

  log(params: AppendSystemLogParams): void {
    const entry: SystemLogEntry = {
      id: ++this._nextId,
      timestamp: Date.now(),
      level: params.level,
      source: params.source,
      module: params.module,
      message: params.message,
      connectionId: params.connectionId,
      slaveId: params.slaveId,
      details: params.details
    }

    const serialized = JSON.stringify(entry)
    const entrySize = Buffer.byteLength(serialized, 'utf8') + 1
    this._entries.push(entry)
    this._entrySizes.push(entrySize)
    this._bufferBytes += entrySize

    this._trimToBufferLimit()

    this._appendToFile(serialized)
    this._windows.send('system_log_entry', entry)
  }

  clear(): void {
    this._entries = []
    this._entrySizes = []
    this._bufferBytes = 0
    this._nextId = 0
    this._windows.send('system_log_clear', undefined)
  }

  getStats(): SystemLogStats {
    const byLevel = Object.fromEntries(LEVELS.map((level) => [level, 0])) as Record<
      SystemLogLevel,
      number
    >
    const bySource = Object.fromEntries(SOURCES.map((source) => [source, 0])) as Record<
      SystemLogSource,
      number
    >

    for (const entry of this._entries) {
      byLevel[entry.level] += 1
      bySource[entry.source] += 1
    }

    return {
      total: this._entries.length,
      byLevel,
      bySource,
      bufferBytes: this._bufferBytes,
      bufferLimitBytes: this._maxBufferBytes
    }
  }

  exportToFile(filepath: string): void {
    const lines = this._entries.map((entry) => JSON.stringify(entry))
    fs.writeFileSync(filepath, lines.join('\n'), 'utf8')
  }

  getEntries(limit?: number): SystemLogEntry[] {
    if (!limit || limit <= 0) return [...this._entries]
    return this._entries.slice(Math.max(0, this._entries.length - limit))
  }

  setMaxBufferBytes(nextLimitBytes: number): void {
    const normalized = Math.max(1, Math.floor(nextLimitBytes))
    this._maxBufferBytes = normalized
    this._trimToBufferLimit()
  }

  getMaxBufferBytes(): number {
    return this._maxBufferBytes
  }

  private _ensureLogDir(): void {
    if (!fs.existsSync(this._logDir)) {
      fs.mkdirSync(this._logDir, { recursive: true })
    }
  }

  private _appendToFile(serialized: string): void {
    try {
      this._rotateIfNeeded()
      fs.appendFileSync(this._logFile, `${serialized}\n`, 'utf8')
    } catch (error) {
      console.error('[SystemLogger] file append failed:', error)
    }
  }

  private _trimToBufferLimit(): void {
    while (this._bufferBytes > this._maxBufferBytes && this._entries.length > 0) {
      this._entries.shift()
      const removed = this._entrySizes.shift() ?? 0
      this._bufferBytes = Math.max(0, this._bufferBytes - removed)
    }
  }

  private _rotateIfNeeded(): void {
    if (!fs.existsSync(this._logFile)) return
    const stat = fs.statSync(this._logFile)
    if (stat.size < this._fileLimitBytes) return

    for (let i = this._maxLogFiles - 1; i >= 1; i--) {
      const src = `${this._logFile}.${i}`
      const dst = `${this._logFile}.${i + 1}`
      if (fs.existsSync(src)) {
        if (i + 1 > this._maxLogFiles) fs.unlinkSync(src)
        else fs.renameSync(src, dst)
      }
    }

    fs.renameSync(this._logFile, `${this._logFile}.1`)
  }
}
