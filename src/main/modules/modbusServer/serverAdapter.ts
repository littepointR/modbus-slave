import { ServerTCP } from 'modbus-serial'
import type { IServiceVector } from 'modbus-serial'
import net from 'net'
import dgram from 'dgram'
import { SerialPort } from 'serialport'
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

/**
 * Calculate Modbus RTU CRC16
 */
function calculateCRC16(data: Buffer): number {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001
      } else {
        crc = crc >> 1
      }
    }
  }
  return crc
}

/**
 * Verify RTU CRC
 */
function verifyRTUCRC(frame: Buffer): boolean {
  if (frame.length < 4) return false
  const data = frame.slice(0, -2)
  const receivedCRC = frame.readUInt16LE(frame.length - 2)
  const calculatedCRC = calculateCRC16(data)
  return receivedCRC === calculatedCRC
}

/**
 * Add CRC to RTU frame
 */
function addRTUCRC(frame: Buffer): Buffer {
  const crc = calculateCRC16(frame)
  const crcBuffer = Buffer.alloc(2)
  crcBuffer.writeUInt16LE(crc, 0)
  return Buffer.concat([frame, crcBuffer])
}

/**
 * Calculate Modbus ASCII LRC
 */
function calculateLRC(data: Buffer): number {
  let lrc = 0
  for (let i = 0; i < data.length; i++) {
    lrc += data[i]
  }
  return -lrc & 0xff
}

/**
 * Verify ASCII LRC
 */
function verifyASCIILRC(frame: Buffer): boolean {
  if (frame.length < 2) return false
  const data = frame.slice(0, -1)
  const receivedLRC = frame[frame.length - 1]
  const calculatedLRC = calculateLRC(data)
  return receivedLRC === calculatedLRC
}

/**
 * Parse ASCII frame (convert from hex string to binary)
 * Format: :XXYYZZ...LL\r\n
 */
function parseASCIIFrame(frame: Buffer): Buffer | null {
  const str = frame.toString('ascii')
  if (!str.startsWith(':') || !str.endsWith('\r\n')) return null

  const hexData = str.slice(1, -2) // Remove ':' prefix and '\r\n' suffix
  if (hexData.length % 2 !== 0) return null

  const binary = Buffer.alloc(hexData.length / 2)
  for (let i = 0; i < hexData.length; i += 2) {
    binary[i / 2] = parseInt(hexData.substr(i, 2), 16)
  }
  return binary
}

/**
 * Create ASCII frame (convert from binary to hex string)
 */
function createASCIIFrame(binary: Buffer): Buffer {
  let hexStr = ':'
  for (let i = 0; i < binary.length; i++) {
    hexStr += binary[i].toString(16).padStart(2, '0').toUpperCase()
  }
  hexStr += '\r\n'
  return Buffer.from(hexStr, 'ascii')
}

export class RtuServerAdapter extends BaseServerAdapter {
  private _serialConfig: SerialConfig
  private _port: SerialPort | null = null
  private _receiveBuffer: Buffer = Buffer.alloc(0)
  private _frameTimeout: NodeJS.Timeout | null = null
  private readonly _FRAME_TIMEOUT_MS = 4 // 3.5 character times at 9600bps ≈ 4ms

  constructor(vector: IServiceVector, serialConfig: SerialConfig) {
    super(vector)
    this._serialConfig = serialConfig
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._port = new SerialPort({
        path: this._serialConfig.port,
        baudRate: this._serialConfig.baudRate,
        dataBits: this._serialConfig.dataBits,
        stopBits: this._serialConfig.stopBits,
        parity: this._serialConfig.parity,
        autoOpen: false
      })

      this._port.on('open', () => {
        this._running = true
        resolve()
      })

      this._port.on('error', (err) => {
        reject(err)
      })

      this._port.on('data', (data: Buffer) => {
        this._handleRTUData(data)
      })

      this._port.open()
    })
  }

  async stop(): Promise<void> {
    if (this._frameTimeout) {
      clearTimeout(this._frameTimeout)
      this._frameTimeout = null
    }
    if (!this._port) return
    return new Promise((resolve) => {
      this._port!.close(() => {
        this._running = false
        resolve()
      })
    })
  }

  private _handleRTUData(data: Buffer): void {
    // Reset frame timeout on new data
    if (this._frameTimeout) {
      clearTimeout(this._frameTimeout)
    }

    this._receiveBuffer = Buffer.concat([this._receiveBuffer, data])

    // Set timeout to process frame after silence period
    this._frameTimeout = setTimeout(() => {
      this._processRTUFrame()
    }, this._FRAME_TIMEOUT_MS)
  }

  private _processRTUFrame(): void {
    if (this._receiveBuffer.length < 4) {
      this._receiveBuffer = Buffer.alloc(0)
      return
    }

    const frame = this._receiveBuffer
    this._receiveBuffer = Buffer.alloc(0)

    // Verify CRC
    if (!verifyRTUCRC(frame)) {
      console.error('RTU CRC error')
      return
    }

    // Parse frame
    const unitId = frame[0]
    const functionCode = frame[1]
    const data = frame.slice(2, -2)

    // Process request using vector
    this._processRequest(unitId, functionCode, data, true)
  }

  private async _processRequest(
    unitId: number,
    functionCode: number,
    data: Buffer,
    isRTU: boolean
  ): Promise<void> {
    try {
      let response: Buffer | null = null
      const address = data.readUInt16BE(0)

      switch (functionCode) {
        case 0x01:
        case 0x02: {
          const quantity = data.readUInt16BE(2)
          const getter =
            functionCode === 0x01 ? this._vector.getCoil : this._vector.getDiscreteInput

          if (!getter) break

          const values: boolean[] = []
          for (let i = 0; i < quantity; i++) {
            const val = await new Promise<boolean | undefined>((resolve) => {
              getter(address + i, unitId, (err, value) => {
                if (err) resolve(undefined)
                else resolve(value)
              })
            })
            values.push(val ?? false)
          }

          const byteCount = Math.ceil(quantity / 8)
          const coilData = Buffer.alloc(byteCount)
          for (let i = 0; i < quantity; i++) {
            if (values[i]) {
              coilData[Math.floor(i / 8)] |= 1 << (i % 8)
            }
          }

          response = Buffer.concat([Buffer.from([functionCode, byteCount]), coilData])
          break
        }

        case 0x03:
        case 0x04: {
          const quantity = data.readUInt16BE(2)
          const getter =
            functionCode === 0x03 ? this._vector.getHoldingRegister : this._vector.getInputRegister

          if (!getter) break

          const values: number[] = []
          for (let i = 0; i < quantity; i++) {
            const val = await new Promise<number | undefined>((resolve) => {
              getter(address + i, unitId, (err, value) => {
                if (err) resolve(undefined)
                else resolve(value)
              })
            })
            values.push(val ?? 0)
          }

          const registerData = Buffer.alloc(quantity * 2)
          for (let i = 0; i < quantity; i++) {
            registerData.writeUInt16BE(values[i] & 0xffff, i * 2)
          }

          response = Buffer.concat([Buffer.from([functionCode, quantity * 2]), registerData])
          break
        }

        case 0x05: {
          const value = data.readUInt16BE(2) === 0xff00
          const setter = this._vector.setCoil
          if (setter) {
            await new Promise<void>((resolve) => {
              setter(address, value, unitId, () => resolve())
            })
          }
          response = Buffer.concat([Buffer.from([functionCode]), data])
          break
        }

        case 0x06: {
          const value = data.readUInt16BE(2)
          const setter = this._vector.setRegister
          if (setter) {
            await new Promise<void>((resolve) => {
              setter(address, value, unitId, () => resolve())
            })
          }
          response = Buffer.concat([Buffer.from([functionCode]), data])
          break
        }

        case 0x0f: {
          const quantity = data.readUInt16BE(2)
          const byteCount = data[4]
          const coilData = data.slice(5, 5 + byteCount)
          const setter = this._vector.setCoil

          if (setter) {
            for (let i = 0; i < quantity; i++) {
              const byteIndex = Math.floor(i / 8)
              const bitIndex = i % 8
              const value = (coilData[byteIndex] & (1 << bitIndex)) !== 0
              await new Promise<void>((resolve) => {
                setter(address + i, value, unitId, () => resolve())
              })
            }
          }

          response = Buffer.concat([Buffer.from([functionCode]), data.slice(0, 4)])
          break
        }

        case 0x10: {
          const quantity = data.readUInt16BE(2)
          const byteCount = data[4]
          const registerData = data.slice(5, 5 + byteCount)
          const setter = this._vector.setRegister

          if (setter) {
            for (let i = 0; i < quantity; i++) {
              const value = registerData.readUInt16BE(i * 2)
              await new Promise<void>((resolve) => {
                setter(address + i, value, unitId, () => resolve())
              })
            }
          }

          response = Buffer.concat([Buffer.from([functionCode]), data.slice(0, 4)])
          break
        }

        default:
          // Exception: Illegal Function
          response = Buffer.from([functionCode | 0x80, 0x01])
      }

      if (response) {
        const responseFrame = Buffer.concat([Buffer.from([unitId]), response])

        if (isRTU) {
          const frameWithCRC = addRTUCRC(responseFrame)
          this._port?.write(frameWithCRC)
        } else {
          // ASCII - add LRC and encode
          const lrc = calculateLRC(responseFrame)
          const frameWithLRC = Buffer.concat([responseFrame, Buffer.from([lrc])])
          const asciiFrame = createASCIIFrame(frameWithLRC)
          this._port?.write(asciiFrame)
        }
      }
    } catch (err) {
      console.error('Error processing Modbus request:', err)
      // Exception: Server Device Failure
      const exceptionFrame = Buffer.from([unitId, functionCode | 0x80, 0x04])
      if (isRTU) {
        const frameWithCRC = addRTUCRC(exceptionFrame)
        this._port?.write(frameWithCRC)
      } else {
        const lrc = calculateLRC(exceptionFrame)
        const frameWithLRC = Buffer.concat([exceptionFrame, Buffer.from([lrc])])
        const asciiFrame = createASCIIFrame(frameWithLRC)
        this._port?.write(asciiFrame)
      }
    }
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
  private _port: SerialPort | null = null
  private _receiveBuffer: string = ''

  constructor(vector: IServiceVector, serialConfig: SerialConfig) {
    super(vector)
    this._serialConfig = serialConfig
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._port = new SerialPort({
        path: this._serialConfig.port,
        baudRate: this._serialConfig.baudRate,
        dataBits: this._serialConfig.dataBits,
        stopBits: this._serialConfig.stopBits,
        parity: this._serialConfig.parity,
        autoOpen: false
      })

      this._port.on('open', () => {
        this._running = true
        resolve()
      })

      this._port.on('error', (err) => {
        reject(err)
      })

      this._port.on('data', (data: Buffer) => {
        this._handleASCIIData(data)
      })

      this._port.open()
    })
  }

  async stop(): Promise<void> {
    if (!this._port) return
    return new Promise((resolve) => {
      this._port!.close(() => {
        this._running = false
        resolve()
      })
    })
  }

  private _handleASCIIData(data: Buffer): void {
    this._receiveBuffer += data.toString('ascii')

    // Look for complete frames (ending with \r\n)
    let frameEnd = this._receiveBuffer.indexOf('\r\n')
    while (frameEnd !== -1) {
      const frame = this._receiveBuffer.slice(0, frameEnd + 2)
      this._receiveBuffer = this._receiveBuffer.slice(frameEnd + 2)
      this._processASCIIFrame(Buffer.from(frame, 'ascii'))
      frameEnd = this._receiveBuffer.indexOf('\r\n')
    }

    // Clear buffer if it gets too large (incomplete frame)
    if (this._receiveBuffer.length > 512) {
      this._receiveBuffer = ''
    }
  }

  private _processASCIIFrame(frame: Buffer): void {
    // Parse ASCII to binary
    const binary = parseASCIIFrame(frame)
    if (!binary) {
      console.error('Invalid ASCII frame')
      return
    }

    // Verify LRC
    if (!verifyASCIILRC(binary)) {
      console.error('ASCII LRC error')
      return
    }

    // Parse frame (without LRC)
    const data = binary.slice(0, -1)
    const unitId = data[0]
    const functionCode = data[1]
    const payload = data.slice(2)

    // Use RTU adapter's process logic (same protocol, different framing)
    const rtuAdapter = new RtuServerAdapter(this._vector, this._serialConfig)
    // @ts-ignore - accessing private method
    rtuAdapter._port = this._port
    // @ts-ignore
    rtuAdapter._processRequest(unitId, functionCode, payload, false)
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
