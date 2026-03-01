import { ServerTCP } from 'modbus-serial'
import type { IServiceVector } from 'modbus-serial'
import net from 'net'
import dgram from 'dgram'
import { SerialPort } from 'serialport'
import type { ServerProtocol, SerialConfig, ServerCommPacket } from '@shared'
import { parseMBAPHeader, parseModbusPDU } from '../trafficMonitor'

export interface ServerAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean
  getAddress(): string
  getProtocol(): ServerProtocol
}

type PacketRecorder = (packet: Omit<ServerCommPacket, 'id' | 'timestamp'>) => void

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
  private _onPacket?: PacketRecorder

  constructor(vector: IServiceVector, host: string, port: number, onPacket?: PacketRecorder) {
    super(vector)
    this._host = host
    this._port = port
    this._onPacket = onPacket
  }

  private _recordTcpPacket(
    direction: 'RX' | 'TX',
    clientAddr: string,
    buffer: Buffer | Uint8Array
  ): void {
    if (!this._onPacket) return
    const bytes = buffer instanceof Buffer ? buffer : Buffer.from(buffer)
    const mbap = parseMBAPHeader(bytes)
    if (!mbap) return

    const pdu = parseModbusPDU(bytes, 7)
    if (!pdu) return

    this._onPacket({
      direction,
      protocol: 'ModbusTcp',
      frameType: 'MBAP',
      clientAddr,
      slaveId: mbap.unitId,
      functionCode: pdu.functionCode,
      data: new Uint8Array(bytes),
      parsed: {
        isException: pdu.isException
      }
    })
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

      netServer.on('connection', (socket) => {
        const clientAddr = `${socket.remoteAddress ?? 'unknown'}:${socket.remotePort ?? 0}`
        socket.on('data', (chunk: Buffer) => {
          this._recordTcpPacket('RX', clientAddr, chunk)
        })

        const rawWrite = socket.write.bind(socket)
        ;(socket as any).write = ((chunk: unknown, ...args: unknown[]) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any)
          this._recordTcpPacket('TX', clientAddr, bytes)
          return rawWrite(chunk as any, ...(args as [any]))
        }) as typeof socket.write
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

const getModbusExceptionCode = (error: unknown): number => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'modbusErrorCode' in error &&
    typeof (error as { modbusErrorCode?: unknown }).modbusErrorCode === 'number'
  ) {
    const code = (error as { modbusErrorCode: number }).modbusErrorCode
    if (code >= 1 && code <= 11) return code
  }
  return 0x04
}

export class RtuServerAdapter extends BaseServerAdapter {
  private _serialConfig: SerialConfig
  private _port: SerialPort | null = null
  private _receiveBuffer: Buffer = Buffer.alloc(0)
  private _frameTimeout: NodeJS.Timeout | null = null
  private readonly _FRAME_TIMEOUT_MS = 4 // 3.5 character times at 9600bps ≈ 4ms
  private _onPacket?: PacketRecorder
  private _protocol: 'ModbusRtu' | 'ModbusAscii'

  constructor(
    vector: IServiceVector,
    serialConfig: SerialConfig,
    onPacket?: PacketRecorder,
    protocol: 'ModbusRtu' | 'ModbusAscii' = 'ModbusRtu'
  ) {
    super(vector)
    this._serialConfig = serialConfig
    this._onPacket = onPacket
    this._protocol = protocol
  }

  private _recordSerialPacket(direction: 'RX' | 'TX', frame: Buffer, unitId?: number): void {
    if (!this._onPacket) return

    const frameType = this._protocol === 'ModbusAscii' ? 'ASCII' : 'RTU'
    const clientAddr = `serial:${this._serialConfig.port}`
    const payload = frameType === 'RTU' ? frame.slice(0, -2) : frame
    const parsed = parseModbusPDU(payload, 1)

    this._onPacket({
      direction,
      protocol: this._protocol,
      frameType,
      clientAddr,
      slaveId: unitId ?? payload[0] ?? 0,
      functionCode: parsed?.functionCode ?? payload[1] ?? 0,
      data: new Uint8Array(frame),
      parsed: {
        isException: parsed?.isException
      }
    })
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

  private _getRTURequestFrameLength(buffer: Buffer, offset: number): number | null {
    if (offset + 2 > buffer.length) return null
    const functionCode = buffer[offset + 1]

    // Fixed-length RTU requests: unit(1) + fc(1) + payload(4) + crc(2)
    if ([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x08, 0x0b, 0x11, 0x16].includes(functionCode)) {
      return 8
    }

    // Variable-length write multiple coils/registers.
    if (functionCode === 0x0f || functionCode === 0x10) {
      if (offset + 7 > buffer.length) return null
      const byteCount = buffer[offset + 6]
      return 9 + byteCount
    }

    // Read/write multiple registers.
    if (functionCode === 0x17) {
      if (offset + 11 > buffer.length) return null
      const byteCount = buffer[offset + 10]
      return 13 + byteCount
    }

    // Read device identification (MEI 0x2B/0x0E) request is fixed 6-byte payload.
    if (functionCode === 0x2b) {
      return 10
    }

    return null
  }

  private _processRTUFrame(): void {
    if (this._receiveBuffer.length < 4) {
      this._receiveBuffer = Buffer.alloc(0)
      return
    }

    const buffer = this._receiveBuffer
    this._receiveBuffer = Buffer.alloc(0)

    let offset = 0
    while (offset + 4 <= buffer.length) {
      const frameLength = this._getRTURequestFrameLength(buffer, offset)
      if (!frameLength) break
      if (offset + frameLength > buffer.length) break

      const frame = buffer.slice(offset, offset + frameLength)
      offset += frameLength

      if (!verifyRTUCRC(frame)) {
        console.error('RTU CRC error')
        continue
      }

      const unitId = frame[0]
      const functionCode = frame[1]
      const data = frame.slice(2, -2)

      this._recordSerialPacket('RX', frame, unitId)
      void this._processRequest(unitId, functionCode, data, true)
    }

    if (offset < buffer.length) {
      this._receiveBuffer = buffer.slice(offset)
    }
  }

  private async _readHoldingRegister(address: number, unitId: number): Promise<number> {
    const getter = this._vector.getHoldingRegister
    if (!getter) throw new Error('Holding register getter is not available')
    return new Promise<number>((resolve, reject) => {
      getter(address, unitId, (err, value) => {
        if (err) {
          reject(err)
          return
        }
        resolve((value ?? 0) & 0xffff)
      })
    })
  }

  private async _writeHoldingRegister(
    address: number,
    value: number,
    unitId: number
  ): Promise<void> {
    const setter = this._vector.setRegister
    if (!setter) throw new Error('Holding register setter is not available')
    await new Promise<void>((resolve, reject) => {
      setter(address, value & 0xffff, unitId, (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }

  private async _readHoldingRange(
    address: number,
    quantity: number,
    unitId: number
  ): Promise<number[]> {
    const values: number[] = []
    for (let i = 0; i < quantity; i++) {
      values.push(await this._readHoldingRegister(address + i, unitId))
    }
    return values
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
            const val = await new Promise<boolean>((resolve, reject) => {
              getter(address + i, unitId, (err, value) => {
                if (err) {
                  reject(err)
                  return
                }
                resolve(value)
              })
            })
            values.push(val)
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
            const val = await new Promise<number>((resolve, reject) => {
              getter(address + i, unitId, (err, value) => {
                if (err) {
                  reject(err)
                  return
                }
                resolve(value)
              })
            })
            values.push(val)
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
            await new Promise<void>((resolve, reject) => {
              setter(address, value, unitId, (err) => {
                if (err) {
                  reject(err)
                  return
                }
                resolve()
              })
            })
          }
          response = Buffer.concat([Buffer.from([functionCode]), data])
          break
        }

        case 0x06: {
          const value = data.readUInt16BE(2)
          const setter = this._vector.setRegister
          if (setter) {
            await new Promise<void>((resolve, reject) => {
              setter(address, value, unitId, (err) => {
                if (err) {
                  reject(err)
                  return
                }
                resolve()
              })
            })
          }
          response = Buffer.concat([Buffer.from([functionCode]), data])
          break
        }

        case 0x08: {
          // Diagnostics (serial only) - echo request data.
          response = Buffer.concat([Buffer.from([functionCode]), data])
          break
        }

        case 0x0b: {
          // Get Comm Event Counter (serial only).
          const status = 0x0000
          const eventCount = 0x0000
          const payload = Buffer.alloc(4)
          payload.writeUInt16BE(status, 0)
          payload.writeUInt16BE(eventCount, 2)
          response = Buffer.concat([Buffer.from([functionCode]), payload])
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
              await new Promise<void>((resolve, reject) => {
                setter(address + i, value, unitId, (err) => {
                  if (err) {
                    reject(err)
                    return
                  }
                  resolve()
                })
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
              await new Promise<void>((resolve, reject) => {
                setter(address + i, value, unitId, (err) => {
                  if (err) {
                    reject(err)
                    return
                  }
                  resolve()
                })
              })
            }
          }

          response = Buffer.concat([Buffer.from([functionCode]), data.slice(0, 4)])
          break
        }

        case 0x11: {
          // Report Server ID (serial only).
          const serverId = 0x01
          const runIndicator = 0xff
          const description = Buffer.from('MODBUS-SLAVE', 'ascii')
          const byteCount = 2 + description.length
          response = Buffer.concat([
            Buffer.from([functionCode, byteCount, serverId, runIndicator]),
            description
          ])
          break
        }

        case 0x16: {
          // Mask Write Register
          const andMask = data.readUInt16BE(2)
          const orMask = data.readUInt16BE(4)
          const current = await this._readHoldingRegister(address, unitId)
          const next = (current & andMask) | (orMask & (~andMask & 0xffff))
          await this._writeHoldingRegister(address, next, unitId)
          response = Buffer.concat([Buffer.from([functionCode]), data.slice(0, 6)])
          break
        }

        case 0x17: {
          // Read/Write Multiple Registers
          const readAddress = data.readUInt16BE(0)
          const readQuantity = data.readUInt16BE(2)
          const writeAddress = data.readUInt16BE(4)
          const writeQuantity = data.readUInt16BE(6)
          const writeByteCount = data[8]
          const writeData = data.slice(9, 9 + writeByteCount)

          for (let i = 0; i < writeQuantity; i++) {
            const value = writeData.readUInt16BE(i * 2)
            await this._writeHoldingRegister(writeAddress + i, value, unitId)
          }

          const readValues = await this._readHoldingRange(readAddress, readQuantity, unitId)
          const readBuffer = Buffer.alloc(readQuantity * 2)
          readValues.forEach((value, index) => readBuffer.writeUInt16BE(value, index * 2))
          response = Buffer.concat([Buffer.from([functionCode, readQuantity * 2]), readBuffer])
          break
        }

        case 0x2b: {
          // Read Device Identification (MEI type 0x0E)
          const meiType = data[0]
          if (meiType !== 0x0e) {
            response = Buffer.from([functionCode | 0x80, 0x01])
            break
          }
          const readDeviceIdCode = data[2] ?? 0x01
          const vendor = Buffer.from('Modbus Slave', 'ascii')
          const product = Buffer.from('Server Emulator', 'ascii')
          const revision = Buffer.from('1.0', 'ascii')

          const objectList = Buffer.concat([
            Buffer.from([0x00, vendor.length]),
            vendor,
            Buffer.from([0x01, product.length]),
            product,
            Buffer.from([0x02, revision.length]),
            revision
          ])

          response = Buffer.concat([
            Buffer.from([functionCode, 0x0e, readDeviceIdCode, 0x01, 0x00, 0x00, 0x03]),
            objectList
          ])
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
          this._recordSerialPacket('TX', frameWithCRC, unitId)
          this._port?.write(frameWithCRC)
        } else {
          // ASCII - add LRC and encode
          const lrc = calculateLRC(responseFrame)
          const frameWithLRC = Buffer.concat([responseFrame, Buffer.from([lrc])])
          const asciiFrame = createASCIIFrame(frameWithLRC)
          this._recordSerialPacket('TX', asciiFrame, unitId)
          this._port?.write(asciiFrame)
        }
      }
    } catch (err) {
      console.error('Error processing Modbus request:', err)
      const exceptionCode = getModbusExceptionCode(err)
      const exceptionFrame = Buffer.from([unitId, functionCode | 0x80, exceptionCode])
      if (isRTU) {
        const frameWithCRC = addRTUCRC(exceptionFrame)
        this._recordSerialPacket('TX', frameWithCRC, unitId)
        this._port?.write(frameWithCRC)
      } else {
        const lrc = calculateLRC(exceptionFrame)
        const frameWithLRC = Buffer.concat([exceptionFrame, Buffer.from([lrc])])
        const asciiFrame = createASCIIFrame(frameWithLRC)
        this._recordSerialPacket('TX', asciiFrame, unitId)
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
  private _onPacket?: PacketRecorder

  constructor(vector: IServiceVector, serialConfig: SerialConfig, onPacket?: PacketRecorder) {
    super(vector)
    this._serialConfig = serialConfig
    this._onPacket = onPacket
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

    if (this._onPacket) {
      this._onPacket({
        direction: 'RX',
        protocol: 'ModbusAscii',
        frameType: 'ASCII',
        clientAddr: `serial:${this._serialConfig.port}`,
        slaveId: unitId,
        functionCode,
        data: new Uint8Array(frame),
        parsed: {
          isException: false
        }
      })
    }

    // Use RTU adapter's process logic (same protocol, different framing)
    const rtuAdapter = new RtuServerAdapter(
      this._vector,
      this._serialConfig,
      this._onPacket,
      'ModbusAscii'
    )
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
  onPacket?: PacketRecorder
}

export function createServerAdapter(
  protocol: ServerProtocol,
  vector: IServiceVector,
  config: ServerAdapterConfig
): ServerAdapter {
  const host = config.host ?? '0.0.0.0'
  const port = config.port ?? 502
  const onPacket = config.onPacket

  switch (protocol) {
    case 'ModbusTcp':
      return new TcpServerAdapter(vector, host, port, onPacket)
    case 'ModbusUdp':
      return new UdpServerAdapter(vector, host, port)
    case 'ModbusRtu':
      if (!config.serial) throw new Error('Serial config required for RTU')
      return new RtuServerAdapter(vector, config.serial, onPacket, 'ModbusRtu')
    case 'ModbusAscii':
      if (!config.serial) throw new Error('Serial config required for ASCII')
      return new AsciiServerAdapter(vector, config.serial, onPacket)
    case 'ModbusRtuOverTcp':
      return new RtuOverTcpServerAdapter(vector, host, port)
    case 'ModbusRtuOverUdp':
      return new RtuOverUdpServerAdapter(vector, host, port)
    default:
      throw new Error(`Unsupported protocol: ${protocol}`)
  }
}
