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
          }
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
})
