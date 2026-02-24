import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Windows } from '@shared'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  TrafficMonitor,
  getFunctionCodeName,
  parseMBAPHeader,
  parseModbusPDU
} from '../trafficMonitor'

const createWindows = (): Windows => ({ send: vi.fn() }) as unknown as Windows

describe('trafficMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records packet only when monitor is running', () => {
    const windows = createWindows()
    const monitor = new TrafficMonitor(windows)

    monitor.recordPacket({
      direction: 'RX',
      protocol: 'ModbusTcp',
      frameType: 'MBAP',
      clientAddr: '127.0.0.1:1502',
      slaveId: 1,
      functionCode: 3,
      data: new Uint8Array([0x01, 0x02]),
      parsed: { isException: false }
    })
    expect(monitor.getPackets()).toHaveLength(0)

    monitor.start()
    monitor.recordPacket({
      direction: 'TX',
      protocol: 'ModbusTcp',
      frameType: 'MBAP',
      clientAddr: '127.0.0.1:1502',
      slaveId: 1,
      functionCode: 3,
      data: new Uint8Array([0x03, 0x04]),
      parsed: { isException: false }
    })

    expect(monitor.getPackets()).toHaveLength(1)
    expect((windows.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('comm_packet')
  })

  it('filters packets and computes stats', () => {
    const windows = createWindows()
    const monitor = new TrafficMonitor(windows)
    monitor.start()

    monitor.recordPacket({
      direction: 'RX',
      protocol: 'ModbusTcp',
      frameType: 'MBAP',
      clientAddr: 'a',
      slaveId: 1,
      functionCode: 3,
      data: new Uint8Array([0x00, 0x01]),
      parsed: { isException: false }
    })
    monitor.recordPacket({
      direction: 'TX',
      protocol: 'ModbusTcp',
      frameType: 'MBAP',
      clientAddr: 'b',
      slaveId: 2,
      functionCode: 6,
      data: new Uint8Array([0x00, 0x02, 0x00]),
      parsed: { isException: true }
    })

    const filtered = monitor.getPackets({ slaveId: 2, direction: 'TX' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].functionCode).toBe(6)

    const stats = monitor.getStats()
    expect(stats).toEqual({
      totalPackets: 2,
      rxCount: 1,
      txCount: 1,
      exceptionCount: 1,
      bytesTransferred: 5,
      bufferBytes: expect.any(Number),
      bufferLimitBytes: 100 * 1024 * 1024
    })
  })

  it('clears packet buffer and emits clear event', () => {
    const windows = createWindows()
    const monitor = new TrafficMonitor(windows)
    monitor.start()
    monitor.recordPacket({
      direction: 'RX',
      protocol: 'ModbusTcp',
      frameType: 'MBAP',
      clientAddr: 'x',
      slaveId: 1,
      functionCode: 1,
      data: new Uint8Array([0x01]),
      parsed: { isException: false }
    })

    monitor.clear()

    expect(monitor.getPackets()).toHaveLength(0)
    expect(windows.send).toHaveBeenCalledWith('comm_monitor_clear', undefined)
  })

  it('exports captured packets to csv', () => {
    const windows = createWindows()
    const monitor = new TrafficMonitor(windows)
    monitor.start()
    monitor.recordPacket({
      direction: 'RX',
      protocol: 'ModbusTcp',
      frameType: 'MBAP',
      clientAddr: '127.0.0.1:1502',
      slaveId: 7,
      functionCode: 16,
      data: new Uint8Array([0xaa, 0xbb]),
      parsed: { isException: false }
    })

    const output = path.join(os.tmpdir(), `modbux-comm-${Date.now()}.csv`)
    monitor.exportToFile(output)

    const content = fs.readFileSync(output, 'utf8')
    expect(content).toContain('ID,Timestamp,Direction,Client,SlaveID,FunctionCode,Data')
    expect(content).toContain(',RX,127.0.0.1:1502,7,10,aa bb')

    fs.unlinkSync(output)
  })
})

describe('trafficMonitor parsers', () => {
  it('parses MBAP header and validates short buffer', () => {
    expect(parseMBAPHeader(new Uint8Array([0x00, 0x01, 0x00]))).toBeNull()

    const parsed = parseMBAPHeader(new Uint8Array([0x00, 0x2a, 0x00, 0x00, 0x00, 0x06, 0x11]))
    expect(parsed).toEqual({
      transactionId: 42,
      protocolId: 0,
      length: 6,
      unitId: 17
    })
  })

  it('parses Modbus PDU with normal and exception function codes', () => {
    const normal = parseModbusPDU(new Uint8Array([0x03, 0x00, 0x2a]))
    expect(normal).toEqual({
      functionCode: 3,
      isException: false,
      data: new Uint8Array([0x00, 0x2a])
    })

    const exception = parseModbusPDU(new Uint8Array([0x83, 0x02]))
    expect(exception).toEqual({
      functionCode: 3,
      isException: true,
      data: new Uint8Array([0x02])
    })
  })

  it('returns function code names and fallback label', () => {
    expect(getFunctionCodeName(0x03)).toBe('Read Holding Registers')
    expect(getFunctionCodeName(0x16)).toBe('Mask Write Register')
    expect(getFunctionCodeName(0x17)).toBe('Read/Write Multiple Registers')
    expect(getFunctionCodeName(0x2b)).toBe('Read Device Identification')
    expect(getFunctionCodeName(0x7f)).toBe('Function 7F')
  })
})
