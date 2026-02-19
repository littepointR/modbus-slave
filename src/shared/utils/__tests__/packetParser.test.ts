import { describe, it, expect } from 'vitest'
import {
  parseModbusTcpPacket,
  formatHex,
  formatAscii,
  FUNCTION_CODES,
  EXCEPTION_CODES,
  exportPacketsToCsv
} from '../packetParser'
import type { ServerCommPacket } from '../../types/comm'

describe('Packet Parser', () => {
  describe('parseModbusTcpPacket', () => {
    it('should parse read coils request', () => {
      // MBAP header + function code 01 + start address 0000 + quantity 000A
      const data = new Uint8Array([
        0x00,
        0x01, // Transaction ID
        0x00,
        0x00, // Protocol ID
        0x00,
        0x06, // Length
        0x01, // Unit ID
        0x01, // Function code (Read Coils)
        0x00,
        0x00, // Start address
        0x00,
        0x0a // Quantity (10)
      ])

      const result = parseModbusTcpPacket(data)
      expect(result).not.toBeNull()
      expect(result?.functionCode).toBe(0x01)
      expect(result?.unitId).toBe(1)
      expect(result?.data.startAddress).toBe(0)
      expect(result?.data.quantity).toBe(10)
      expect(result?.description).toContain('Read Coils')
    })

    it('should parse read holding registers request', () => {
      const data = new Uint8Array([
        0x00,
        0x02,
        0x00,
        0x00,
        0x00,
        0x06,
        0x01,
        0x03, // Function code 03
        0x00,
        0x64, // Start address 100
        0x00,
        0x05 // Quantity 5
      ])

      const result = parseModbusTcpPacket(data)
      expect(result?.functionCode).toBe(0x03)
      expect(result?.data.startAddress).toBe(100)
      expect(result?.data.quantity).toBe(5)
    })

    it('should parse write single register', () => {
      const data = new Uint8Array([
        0x00,
        0x03,
        0x00,
        0x00,
        0x00,
        0x06,
        0x01,
        0x06, // Function code 06
        0x00,
        0x0a, // Address 10
        0x00,
        0xff // Value 255
      ])

      const result = parseModbusTcpPacket(data)
      expect(result?.functionCode).toBe(0x06)
      expect(result?.data.startAddress).toBe(10)
      expect(result?.data.registerValues).toEqual([255])
    })

    it('should parse exception response', () => {
      const data = new Uint8Array([
        0x00,
        0x04,
        0x00,
        0x00,
        0x00,
        0x03,
        0x01,
        0x83, // Exception function code (0x03 + 0x80)
        0x02 // Exception code (Illegal Data Address)
      ])

      const result = parseModbusTcpPacket(data)
      expect(result?.isException).toBe(true)
      expect(result?.exceptionCode).toBe(2)
      expect(result?.exceptionText).toBe('Illegal Data Address')
    })

    it('should return null for short packet', () => {
      const data = new Uint8Array([0x00, 0x01])
      expect(parseModbusTcpPacket(data)).toBeNull()
    })
  })

  describe('formatHex', () => {
    it('should format bytes as hex', () => {
      const data = new Uint8Array([0x01, 0x0f, 0xff])
      expect(formatHex(data)).toBe('01 0F FF')
    })

    it('should use custom separator', () => {
      const data = new Uint8Array([0x01, 0x02])
      expect(formatHex(data, '-')).toBe('01-02')
    })
  })

  describe('formatAscii', () => {
    it('should format printable chars', () => {
      const data = new Uint8Array([0x48, 0x69]) // "Hi"
      expect(formatAscii(data)).toBe('Hi')
    })

    it('should use dots for non-printable', () => {
      const data = new Uint8Array([0x00, 0x7f])
      expect(formatAscii(data)).toBe('..')
    })
  })

  describe('exportPacketsToCsv', () => {
    it('should export packets to CSV', () => {
      const packets: ServerCommPacket[] = [
        {
          id: 1,
          timestamp: 1234567890,
          direction: 'RX',
          protocol: 'ModbusTcp',
          frameType: 'MBAP',
          clientAddr: '192.168.1.1',
          slaveId: 1,
          functionCode: 3,
          data: new Uint8Array([
            0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x01, 0x03, 0x00, 0x00, 0x00, 0x0a
          ]),
          parsed: {}
        }
      ]

      const csv = exportPacketsToCsv(packets)
      expect(csv).toContain('ID,Timestamp,Direction,Unit ID,Function,Description,Raw Data')
      expect(csv).toContain('1,')
      expect(csv).toContain('RX')
    })
  })

  describe('FUNCTION_CODES', () => {
    it('should have common function codes', () => {
      expect(FUNCTION_CODES[0x01]).toBe('Read Coils')
      expect(FUNCTION_CODES[0x03]).toBe('Read Holding Registers')
      expect(FUNCTION_CODES[0x10]).toBe('Write Multiple Registers')
    })
  })

  describe('EXCEPTION_CODES', () => {
    it('should have common exception codes', () => {
      expect(EXCEPTION_CODES[0x01]).toBe('Illegal Function')
      expect(EXCEPTION_CODES[0x02]).toBe('Illegal Data Address')
      expect(EXCEPTION_CODES[0x03]).toBe('Illegal Data Value')
    })
  })
})
