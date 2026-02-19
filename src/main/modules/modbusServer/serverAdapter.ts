import { ServerTCP } from 'modbus-serial'
import type { IServiceVector } from 'modbus-serial'
import net from 'net'
import dgram from 'dgram'
import type { ServerProtocol, SerialConfig } from '@shared'

export interface ServerAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean
  getAddress(): string
  getProtocol(): ServerProtocol
}

abstract class BaseServerAdapter implements ServerAdapter {
  protected _vector: IServiceVector
  protected _running = false

  constructor(vector: IServiceVector) {
    this._vector = vector
  }

  abstract start(): Promise<void>
  abstract stop(): Promise<void>

  isRunning(): boolean {
    return this._running
  }

  abstract getAddress(): string
  abstract getProtocol(): ServerProtocol
}

export class TcpServerAdapter extends BaseServerAdapter {
  private _server: ServerTCP | null = null
  private _host: string
  private _port: number

  constructor(vector: IServiceVector, host: string, port: number) {
    super(vector)
    this._host = host
    this._port = port
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._server = new ServerTCP(this._vector, {
        host: this._host,
        port: this._port
      })

      const netServer = (this._server as any)['_server'] as net.Server
      netServer.once('listening', () => {
        this._running = true
        resolve()
      })
      netServer.once('error', (err) => {
        reject(err)
      })
    })
  }

  async stop(): Promise<void> {
    if (!this._server) return
    return new Promise((resolve) => {
      this._server!.close(() => {
        this._running = false
        resolve()
      })
    })
  }

  getAddress(): string {
    return `${this._host}:${this._port}`
  }

  getProtocol(): ServerProtocol {
    return 'ModbusTcp'
  }
}

export class UdpServerAdapter extends BaseServerAdapter {
  private _socket: dgram.Socket | null = null
  private _host: string
  private _port: number

  constructor(vector: IServiceVector, host: string, port: number) {
    super(vector)
    this._host = host
    this._port = port
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._socket = dgram.createSocket('udp4')

      this._socket.on('listening', () => {
        this._running = true
        resolve()
      })

      this._socket.on('error', (err) => {
        reject(err)
      })

      this._socket.bind(this._port, this._host)
    })
  }

  async stop(): Promise<void> {
    if (!this._socket) return
    return new Promise((resolve) => {
      this._socket!.close(() => {
        this._running = false
        resolve()
      })
    })
  }

  getAddress(): string {
    return `${this._host}:${this._port}/udp`
  }

  getProtocol(): ServerProtocol {
    return 'ModbusUdp'
  }
}

export class RtuServerAdapter extends BaseServerAdapter {
  private _serialConfig: SerialConfig

  constructor(vector: IServiceVector, serialConfig: SerialConfig) {
    super(vector)
    this._serialConfig = serialConfig
  }

  async start(): Promise<void> {
    throw new Error('Modbus RTU Server not yet implemented. Please use TCP mode.')
  }

  async stop(): Promise<void> {
    this._running = false
  }

  getAddress(): string {
    return this._serialConfig.port
  }

  getProtocol(): ServerProtocol {
    return 'ModbusRtu'
  }
}

export class AsciiServerAdapter extends BaseServerAdapter {
  private _serialConfig: SerialConfig

  constructor(vector: IServiceVector, serialConfig: SerialConfig) {
    super(vector)
    this._serialConfig = serialConfig
  }

  async start(): Promise<void> {
    throw new Error('Modbus ASCII Server not yet implemented. Please use TCP mode.')
  }

  async stop(): Promise<void> {
    this._running = false
  }

  getAddress(): string {
    return `${this._serialConfig.port}/ASCII`
  }

  getProtocol(): ServerProtocol {
    return 'ModbusAscii'
  }
}

export class RtuOverTcpServerAdapter extends BaseServerAdapter {
  private _server: ServerTCP | null = null
  private _host: string
  private _port: number

  constructor(vector: IServiceVector, host: string, port: number) {
    super(vector)
    this._host = host
    this._port = port
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._server = new ServerTCP(this._vector, {
        host: this._host,
        port: this._port
      })

      const netServer = (this._server as any)['_server'] as net.Server
      netServer.once('listening', () => {
        this._running = true
        resolve()
      })
      netServer.once('error', (err) => {
        reject(err)
      })
    })
  }

  async stop(): Promise<void> {
    if (!this._server) return
    return new Promise((resolve) => {
      this._server!.close(() => {
        this._running = false
        resolve()
      })
    })
  }

  getAddress(): string {
    return `${this._host}:${this._port}/RTU`
  }

  getProtocol(): ServerProtocol {
    return 'ModbusRtuOverTcp'
  }
}

export class RtuOverUdpServerAdapter extends BaseServerAdapter {
  private _socket: dgram.Socket | null = null
  private _host: string
  private _port: number

  constructor(vector: IServiceVector, host: string, port: number) {
    super(vector)
    this._host = host
    this._port = port
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._socket = dgram.createSocket('udp4')

      this._socket.on('listening', () => {
        this._running = true
        resolve()
      })

      this._socket.on('error', (err) => {
        reject(err)
      })

      this._socket.bind(this._port, this._host)
    })
  }

  async stop(): Promise<void> {
    if (!this._socket) return
    return new Promise((resolve) => {
      this._socket!.close(() => {
        this._running = false
        resolve()
      })
    })
  }

  getAddress(): string {
    return `${this._host}:${this._port}/RTU/udp`
  }

  getProtocol(): ServerProtocol {
    return 'ModbusRtuOverUdp'
  }
}

export interface ServerAdapterConfig {
  host?: string
  port?: number
  serial?: SerialConfig
}

export function createServerAdapter(
  protocol: ServerProtocol,
  vector: IServiceVector,
  config: ServerAdapterConfig
): ServerAdapter {
  const host = config.host ?? '0.0.0.0'
  const port = config.port ?? 502

  switch (protocol) {
    case 'ModbusTcp':
      return new TcpServerAdapter(vector, host, port)
    case 'ModbusUdp':
      return new UdpServerAdapter(vector, host, port)
    case 'ModbusRtu':
      if (!config.serial) throw new Error('Serial config required for RTU')
      return new RtuServerAdapter(vector, config.serial)
    case 'ModbusAscii':
      if (!config.serial) throw new Error('Serial config required for ASCII')
      return new AsciiServerAdapter(vector, config.serial)
    case 'ModbusRtuOverTcp':
      return new RtuOverTcpServerAdapter(vector, host, port)
    case 'ModbusRtuOverUdp':
      return new RtuOverUdpServerAdapter(vector, host, port)
    default:
      throw new Error(`Unsupported protocol: ${protocol}`)
  }
}
