import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IServiceVector } from 'modbus-serial'

const { tcpInstances, udpSockets, serialInstances } = vi.hoisted(() => ({
  tcpInstances: [] as Array<{
    options: { host: string; port: number }
    handlers: Record<string, (...args: unknown[]) => void>
    close: ReturnType<typeof vi.fn>
  }>,
  udpSockets: [] as Array<{
    handlers: Record<string, (...args: unknown[]) => void>
    bind: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }>,
  serialInstances: [] as Array<{
    options: {
      path: string
      baudRate: number
      dataBits: number
      stopBits: number
      parity: 'none' | 'even' | 'odd'
      autoOpen: boolean
    }
    handlers: Record<string, (...args: unknown[]) => void>
    open: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('modbus-serial', () => ({
  ServerTCP: vi
    .fn()
    .mockImplementation(function (_vector: IServiceVector, options: { host: string; port: number }) {
      const handlers: Record<string, (...args: unknown[]) => void> = {}
      const close = vi.fn((cb: () => void) => cb())
      const instance = {
        _server: {
          once: (event: string, handler: (...args: unknown[]) => void) => {
            handlers[event] = handler
          },
          on: vi.fn()
        },
        close
      }
      tcpInstances.push({ options, handlers, close })
      return instance
    })
}))

vi.mock('dgram', () => ({
  default: {
    createSocket: vi.fn(() => {
      const handlers: Record<string, (...args: unknown[]) => void> = {}
      const bind = vi.fn((port: number, host: string) => {
        void port
        void host
        handlers.listening?.()
      })
      const close = vi.fn((cb: () => void) => cb())
      const socket = {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler
        },
        bind,
        close
      }
      udpSockets.push({ handlers, bind, close })
      return socket
    })
  }
}))

vi.mock('serialport', () => ({
  SerialPort: vi
    .fn()
    .mockImplementation(function (options: {
      path: string
      baudRate: number
      dataBits: number
      stopBits: number
      parity: 'none' | 'even' | 'odd'
      autoOpen: boolean
    }) {
      const handlers: Record<string, (...args: unknown[]) => void> = {}
      const open = vi.fn(() => handlers.open?.())
      const close = vi.fn((cb: () => void) => cb())
      const instance = {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler
        },
        open,
        close,
        write: vi.fn()
      }
      serialInstances.push({ options, handlers, open, close })
      return instance
    })
}))

import {
  AsciiServerAdapter,
  RtuOverTcpServerAdapter,
  RtuOverUdpServerAdapter,
  RtuServerAdapter,
  TcpServerAdapter,
  UdpServerAdapter,
  createServerAdapter
} from '../modbusServer/serverAdapter'

const vector = {} as IServiceVector
const serial = {
  port: '/dev/tty.usbmodem',
  baudRate: 19200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none' as const
}

const calculateCRC16 = (data: Buffer): number => {
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

const withRtuCrc = (frame: number[]): Buffer => {
  const data = Buffer.from(frame)
  const crc = calculateCRC16(data)
  const crcBuffer = Buffer.alloc(2)
  crcBuffer.writeUInt16LE(crc, 0)
  return Buffer.concat([data, crcBuffer])
}

describe('serverAdapter', () => {
  beforeEach(() => {
    tcpInstances.length = 0
    udpSockets.length = 0
    serialInstances.length = 0
  })

  it('creates TCP adapter with default host/port', () => {
    const adapter = createServerAdapter('ModbusTcp', vector, {})
    expect(adapter).toBeInstanceOf(TcpServerAdapter)
    expect(adapter.getAddress()).toBe('0.0.0.0:502')
    expect(adapter.getProtocol()).toBe('ModbusTcp')
  })

  it('creates UDP and RTU-over adapters with expected addresses', () => {
    const udp = createServerAdapter('ModbusUdp', vector, { host: '127.0.0.1', port: 1502 })
    const rtuTcp = createServerAdapter('ModbusRtuOverTcp', vector, { host: '127.0.0.1', port: 1503 })
    const rtuUdp = createServerAdapter('ModbusRtuOverUdp', vector, { host: '127.0.0.1', port: 1504 })

    expect(udp).toBeInstanceOf(UdpServerAdapter)
    expect(udp.getAddress()).toBe('127.0.0.1:1502/udp')
    expect(rtuTcp).toBeInstanceOf(RtuOverTcpServerAdapter)
    expect(rtuTcp.getAddress()).toBe('127.0.0.1:1503/RTU')
    expect(rtuUdp).toBeInstanceOf(RtuOverUdpServerAdapter)
    expect(rtuUdp.getAddress()).toBe('127.0.0.1:1504/RTU/udp')
  })

  it('starts and stops RTU-over-TCP adapter', async () => {
    const adapter = new RtuOverTcpServerAdapter(vector, '127.0.0.1', 1507)
    const startPromise = adapter.start()
    tcpInstances[0].handlers.listening?.()
    await startPromise

    expect(adapter.isRunning()).toBe(true)
    expect(adapter.getProtocol()).toBe('ModbusRtuOverTcp')
    expect(adapter.getAddress()).toBe('127.0.0.1:1507/RTU')

    await adapter.stop()
    expect(tcpInstances[0].close).toHaveBeenCalledTimes(1)
    expect(adapter.isRunning()).toBe(false)
  })

  it('starts and stops RTU-over-UDP adapter', async () => {
    const adapter = new RtuOverUdpServerAdapter(vector, '127.0.0.1', 1508)
    await adapter.start()

    expect(adapter.isRunning()).toBe(true)
    expect(adapter.getProtocol()).toBe('ModbusRtuOverUdp')
    expect(adapter.getAddress()).toBe('127.0.0.1:1508/RTU/udp')
    expect(udpSockets[0].bind).toHaveBeenCalledWith(1508, '127.0.0.1')

    await adapter.stop()
    expect(udpSockets[0].close).toHaveBeenCalledTimes(1)
    expect(adapter.isRunning()).toBe(false)
  })

  it('requires serial config for RTU and ASCII', () => {
    expect(() => createServerAdapter('ModbusRtu', vector, {})).toThrow(
      'Serial config required for RTU'
    )
    expect(() => createServerAdapter('ModbusAscii', vector, {})).toThrow(
      'Serial config required for ASCII'
    )
  })

  it('starts and stops TCP adapter', async () => {
    const adapter = new TcpServerAdapter(vector, '0.0.0.0', 1502)
    const startPromise = adapter.start()
    tcpInstances[0].handlers.listening?.()
    await startPromise

    expect(adapter.isRunning()).toBe(true)
    expect(tcpInstances[0].options).toEqual({ host: '0.0.0.0', port: 1502 })

    await adapter.stop()
    expect(tcpInstances[0].close).toHaveBeenCalledTimes(1)
    expect(adapter.isRunning()).toBe(false)
  })

  it('starts and stops UDP adapter', async () => {
    const adapter = new UdpServerAdapter(vector, '127.0.0.1', 1502)
    await adapter.start()

    expect(adapter.isRunning()).toBe(true)
    expect(udpSockets[0].bind).toHaveBeenCalledWith(1502, '127.0.0.1')

    await adapter.stop()
    expect(udpSockets[0].close).toHaveBeenCalledTimes(1)
    expect(adapter.isRunning()).toBe(false)
  })

  it('starts and stops RTU adapter with serial config', async () => {
    const adapter = new RtuServerAdapter(vector, serial)
    await adapter.start()

    expect(serialInstances[0].options).toEqual({
      path: '/dev/tty.usbmodem',
      baudRate: 19200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false
    })
    expect(adapter.getAddress()).toBe('/dev/tty.usbmodem')
    expect(adapter.isRunning()).toBe(true)

    await adapter.stop()
    expect(serialInstances[0].close).toHaveBeenCalledTimes(1)
    expect(adapter.isRunning()).toBe(false)
  })

  it('creates and starts ASCII adapter', async () => {
    const adapter = new AsciiServerAdapter(vector, serial)
    await adapter.start()

    expect(adapter.getAddress()).toBe('/dev/tty.usbmodem/ASCII')
    expect(adapter.getProtocol()).toBe('ModbusAscii')
    expect(adapter.isRunning()).toBe(true)

    await adapter.stop()
    expect(serialInstances[0].close).toHaveBeenCalledTimes(1)
    expect(adapter.isRunning()).toBe(false)
  })

  it('handles FC22 mask write register on RTU adapter', async () => {
    const getHoldingRegister = vi.fn((address: number, unitId: number, cb: (err: null, value: number) => void) => {
      expect(address).toBe(0x0012)
      expect(unitId).toBe(7)
      cb(null, 0x1234)
    })
    const setRegister = vi.fn(
      (address: number, value: number, unitId: number, cb: (err?: Error | null) => void) => {
        expect(address).toBe(0x0012)
        expect(unitId).toBe(7)
        expect(value).toBe(0x12f4)
        cb(null)
      }
    )

    const adapter = new RtuServerAdapter(
      {
        ...vector,
        getHoldingRegister,
        setRegister
      } as IServiceVector,
      serial
    )

    const request = Buffer.from([0x00, 0x12, 0x0f, 0x0f, 0x10, 0xf0])
    await (adapter as any)._processRequest(7, 0x16, request, true)

    expect(getHoldingRegister).toHaveBeenCalledTimes(1)
    expect(setRegister).toHaveBeenCalledTimes(1)
  })

  it('handles FC23 read/write multiple registers on RTU adapter', async () => {
    const setRegister = vi.fn(
      (address: number, value: number, unitId: number, cb: (err?: Error | null) => void) => {
        expect(unitId).toBe(9)
        if (address === 0x0030) expect(value).toBe(0x0011)
        if (address === 0x0031) expect(value).toBe(0x0022)
        cb(null)
      }
    )
    const getHoldingRegister = vi.fn((address: number, unitId: number, cb: (err: null, value: number) => void) => {
      expect(unitId).toBe(9)
      cb(null, address + 0x1000)
    })

    const adapter = new RtuServerAdapter(
      {
        ...vector,
        getHoldingRegister,
        setRegister
      } as IServiceVector,
      serial
    )

    // Read start=0x20 qty=2, write start=0x30 qty=2, byteCount=4, values=0x0011 0x0022
    const request = Buffer.from([
      0x00, 0x20, 0x00, 0x02, 0x00, 0x30, 0x00, 0x02, 0x04, 0x00, 0x11, 0x00, 0x22
    ])
    await (adapter as any)._processRequest(9, 0x17, request, true)

    expect(setRegister).toHaveBeenCalledTimes(2)
    expect(getHoldingRegister).toHaveBeenCalledTimes(2)
    expect(getHoldingRegister).toHaveBeenNthCalledWith(1, 0x0020, 9, expect.any(Function))
    expect(getHoldingRegister).toHaveBeenNthCalledWith(2, 0x0021, 9, expect.any(Function))
  })

  it('returns exception frame when RTU read encounters illegal address', async () => {
    const getHoldingRegister = vi.fn(
      (_address: number, _unitId: number, cb: (err: Error | null, value: number) => void) => {
        const err = new Error('illegal address')
        ;(err as Error & { modbusErrorCode?: number }).modbusErrorCode = 2
        cb(err, 0)
      }
    )

    const adapter = new RtuServerAdapter(
      {
        ...vector,
        getHoldingRegister
      } as IServiceVector,
      serial
    )

    const write = vi.fn()
    ;(adapter as unknown as { _port: { write: ReturnType<typeof vi.fn> } })._port = { write }

    const request = Buffer.from([0x00, 0x10, 0x00, 0x01]) // start=0x0010, qty=1
    await (adapter as any)._processRequest(7, 0x03, request, true)

    expect(write).toHaveBeenCalledTimes(1)
    const sentFrame = write.mock.calls[0][0] as Buffer
    expect(sentFrame[0]).toBe(7)
    expect(sentFrame[1]).toBe(0x83)
    expect(sentFrame[2]).toBe(0x02)
  })

  it('processes concatenated RTU frames from a single receive buffer', async () => {
    const getHoldingRegister = vi.fn((address: number, _unitId: number, cb: (err: null, value: number) => void) => {
      cb(null, address + 0x1000)
    })

    const adapter = new RtuServerAdapter(
      {
        ...vector,
        getHoldingRegister
      } as IServiceVector,
      serial
    )

    const write = vi.fn()
    ;(adapter as unknown as { _port: { write: ReturnType<typeof vi.fn> } })._port = { write }

    const frameA = withRtuCrc([0x01, 0x03, 0x00, 0x10, 0x00, 0x01])
    const frameB = withRtuCrc([0x01, 0x03, 0x00, 0x11, 0x00, 0x01])
    ;(adapter as unknown as { _receiveBuffer: Buffer })._receiveBuffer = Buffer.concat([frameA, frameB])

    ;(adapter as unknown as { _processRTUFrame: () => void })._processRTUFrame()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getHoldingRegister).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenCalledTimes(2)
  })
})
