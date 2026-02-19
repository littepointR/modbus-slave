import { describe, it, expect } from 'vitest'
import {
  toSiemensAddress,
  fromSiemensAddress,
  toStandardPlcAddress,
  fromStandardPlcAddress,
  parsePlcAddress,
  formatPlcAddress,
  validatePlcAddress,
  convertAddressRange,
  type PlcVendor
} from '../plcAddress'
import type { RegisterType } from '../../types'

describe('PLC Address Conversion', () => {
  describe('toSiemensAddress', () => {
    it('should convert holding register 0 to MW40001', () => {
      expect(toSiemensAddress('holding_registers', 0)).toBe('MW40001')
    })

    it('should convert holding register 100 to MW40101', () => {
      expect(toSiemensAddress('holding_registers', 100)).toBe('MW40101')
    })

    it('should convert input register 0 to IW30001', () => {
      expect(toSiemensAddress('input_registers', 0)).toBe('IW30001')
    })

    it('should convert coil 0 to Q1', () => {
      expect(toSiemensAddress('coils', 0)).toBe('Q1')
    })

    it('should convert discrete input 0 to I10001', () => {
      expect(toSiemensAddress('discrete_inputs', 0)).toBe('I10001')
    })
  })

  describe('fromSiemensAddress', () => {
    it('should convert MW40001 to holding register 0', () => {
      expect(fromSiemensAddress('holding_registers', 40001)).toBe(0)
    })

    it('should convert MW40101 to holding register 100', () => {
      expect(fromSiemensAddress('holding_registers', 40101)).toBe(100)
    })

    it('should return null for out of range address', () => {
      expect(fromSiemensAddress('holding_registers', 100000)).toBeNull()
    })
  })

  describe('toStandardPlcAddress', () => {
    it('should convert holding register 0 to 40001', () => {
      expect(toStandardPlcAddress('holding_registers', 0)).toBe('40001')
    })

    it('should convert coil 0 to 1', () => {
      expect(toStandardPlcAddress('coils', 0)).toBe('1')
    })
  })

  describe('fromStandardPlcAddress', () => {
    it('should parse 40001 as holding register 0', () => {
      const result = fromStandardPlcAddress(40001)
      expect(result).toEqual({ registerType: 'holding_registers', modbusAddress: 0 })
    })

    it('should parse 30001 as input register 0', () => {
      const result = fromStandardPlcAddress(30001)
      expect(result).toEqual({ registerType: 'input_registers', modbusAddress: 0 })
    })

    it('should parse 10001 as discrete input 0', () => {
      const result = fromStandardPlcAddress(10001)
      expect(result).toEqual({ registerType: 'discrete_inputs', modbusAddress: 0 })
    })

    it('should parse 1 as coil 0', () => {
      const result = fromStandardPlcAddress(1)
      expect(result).toEqual({ registerType: 'coils', modbusAddress: 0 })
    })

    it('should return null for invalid address', () => {
      expect(fromStandardPlcAddress(50000)).toBeNull()
    })
  })

  describe('parsePlcAddress', () => {
    it('should parse Siemens MW40001 format', () => {
      const result = parsePlcAddress('MW40001')
      expect(result).toMatchObject({
        vendor: 'siemens',
        registerType: 'holding_registers',
        address: 0
      })
    })

    it('should parse Siemens Q1 format', () => {
      const result = parsePlcAddress('Q1')
      expect(result).toMatchObject({
        vendor: 'siemens',
        registerType: 'coils',
        address: 0
      })
    })

    it('should parse standard 40001 format', () => {
      const result = parsePlcAddress('40001')
      expect(result).toMatchObject({
        vendor: 'standard',
        registerType: 'holding_registers',
        address: 0
      })
    })

    it('should parse Mitsubishi D0 format', () => {
      const result = parsePlcAddress('D0')
      expect(result).toMatchObject({
        vendor: 'mitsubishi',
        registerType: 'holding_registers',
        address: 0
      })
    })

    it('should return null for invalid format', () => {
      expect(parsePlcAddress('invalid')).toBeNull()
    })
  })

  describe('formatPlcAddress', () => {
    const testCases: Array<{
      vendor: PlcVendor
      registerType: RegisterType
      address: number
      expected: string
    }> = [
      { vendor: 'siemens', registerType: 'holding_registers', address: 0, expected: 'MW40001' },
      { vendor: 'standard', registerType: 'holding_registers', address: 0, expected: '40001' },
      { vendor: 'mitsubishi', registerType: 'holding_registers', address: 0, expected: 'D0' },
      { vendor: 'mitsubishi', registerType: 'coils', address: 0, expected: 'Y0' }
    ]

    testCases.forEach(({ vendor, registerType, address, expected }) => {
      it(`should format ${vendor} ${registerType} ${address} as ${expected}`, () => {
        expect(formatPlcAddress(vendor, registerType, address)).toBe(expected)
      })
    })
  })

  describe('validatePlcAddress', () => {
    it('should return true for valid address', () => {
      expect(validatePlcAddress('40001')).toBe(true)
    })

    it('should return false for invalid address', () => {
      expect(validatePlcAddress('invalid')).toBe(false)
    })

    it('should validate register type when specified', () => {
      expect(validatePlcAddress('40001', 'holding_registers')).toBe(true)
      expect(validatePlcAddress('40001', 'coils')).toBe(false)
    })
  })

  describe('convertAddressRange', () => {
    it('should convert a range of addresses', () => {
      const result = convertAddressRange('siemens', 'holding_registers', 0, 3)
      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ modbusAddress: 0, plcAddress: 'MW40001' })
      expect(result[1]).toEqual({ modbusAddress: 1, plcAddress: 'MW40002' })
      expect(result[2]).toEqual({ modbusAddress: 2, plcAddress: 'MW40003' })
    })
  })
})
