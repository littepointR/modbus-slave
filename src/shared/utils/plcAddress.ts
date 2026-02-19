/**
 * PLC Address Conversion Utilities
 *
 * Different PLC vendors use different addressing schemes:
 * - Standard Modbus: 0-65535 for each register type
 * - Siemens S7: 40001-49999 (holding), 30001-39999 (input), 00001-09999 (coils), 10001-19999 (discrete inputs)
 * - Allen-Bradley: File-based addressing (e.g., N7:0, F8:0)
 * - Mitsubishi: Device addressing (D0, X0, Y0, etc.)
 */

import type { RegisterType } from '../types'

export type PlcVendor = 'standard' | 'siemens' | 'allen-bradley' | 'mitsubishi' | 'omron'

export interface PlcAddress {
  vendor: PlcVendor
  registerType: RegisterType
  address: number
  displayAddress: string
}

export interface PlcAddressRange {
  start: number
  end: number
  offset: number
  prefix?: string
}

// Siemens S7 address ranges (1-based, 40001-4xxxx, 30001-3xxxx, etc.)
const SIEMENS_RANGES: Record<RegisterType, PlcAddressRange> = {
  coils: { start: 1, end: 9999, offset: 1, prefix: 'Q' },
  discrete_inputs: { start: 10001, end: 19999, offset: 10001, prefix: 'I' },
  input_registers: { start: 30001, end: 39999, offset: 30001, prefix: 'IW' },
  holding_registers: { start: 40001, end: 49999, offset: 40001, prefix: 'MW' }
}

// Standard Modbus ranges (0-based)
const STANDARD_RANGES: Record<RegisterType, PlcAddressRange> = {
  coils: { start: 0, end: 65535, offset: 0 },
  discrete_inputs: { start: 0, end: 65535, offset: 0 },
  input_registers: { start: 0, end: 65535, offset: 0 },
  holding_registers: { start: 0, end: 65535, offset: 0 }
}

/**
 * Convert Modbus address to Siemens S7 format
 */
export function toSiemensAddress(registerType: RegisterType, modbusAddress: number): string {
  const range = SIEMENS_RANGES[registerType]
  const siemensAddr = modbusAddress + range.offset
  return `${range.prefix}${siemensAddr}`
}

/**
 * Convert Siemens S7 address to Modbus address
 */
export function fromSiemensAddress(
  registerType: RegisterType,
  siemensAddress: number
): number | null {
  const range = SIEMENS_RANGES[registerType]
  if (siemensAddress < range.start || siemensAddress > range.end) return null
  const modbusAddr = siemensAddress - range.offset
  if (modbusAddr < 0 || modbusAddr > 65535) return null
  return modbusAddr
}

/**
 * Convert Modbus address to standard PLC format (40001+, 30001+, etc.)
 */
export function toStandardPlcAddress(registerType: RegisterType, modbusAddress: number): string {
  const range = SIEMENS_RANGES[registerType]
  const plcAddr = modbusAddress + range.offset
  return String(plcAddr)
}

/**
 * Convert standard PLC address to Modbus address
 */
export function fromStandardPlcAddress(plcAddress: number): {
  registerType: RegisterType
  modbusAddress: number
} | null {
  // Determine register type based on address range
  if (plcAddress >= 40001 && plcAddress <= 49999) {
    return { registerType: 'holding_registers', modbusAddress: plcAddress - 40001 }
  } else if (plcAddress >= 30001 && plcAddress <= 39999) {
    return { registerType: 'input_registers', modbusAddress: plcAddress - 30001 }
  } else if (plcAddress >= 10001 && plcAddress <= 19999) {
    return { registerType: 'discrete_inputs', modbusAddress: plcAddress - 10001 }
  } else if (plcAddress >= 1 && plcAddress <= 9999) {
    return { registerType: 'coils', modbusAddress: plcAddress - 1 }
  }
  return null
}

/**
 * Parse PLC address string to Modbus address
 * Supports various formats:
 * - Standard: "40001", "30001"
 * - Siemens: "MW40001", "Q1", "I10001"
 * - Mitsubishi: "D0", "X0", "Y0"
 */
export function parsePlcAddress(addressStr: string): PlcAddress | null {
  const trimmed = addressStr.trim().toUpperCase()

  // Siemens format with prefix
  const siemensMatch = trimmed.match(/^(MW|IW|Q|I)(\d+)$/)
  if (siemensMatch) {
    const prefix = siemensMatch[1]
    const addr = parseInt(siemensMatch[2], 10)

    let registerType: RegisterType
    if (prefix === 'MW') registerType = 'holding_registers'
    else if (prefix === 'IW') registerType = 'input_registers'
    else if (prefix === 'Q') registerType = 'coils'
    else if (prefix === 'I') registerType = 'discrete_inputs'
    else return null

    const modbusAddr = fromSiemensAddress(registerType, addr)
    if (modbusAddr === null) return null

    return {
      vendor: 'siemens',
      registerType,
      address: modbusAddr,
      displayAddress: addressStr.trim()
    }
  }

  // Standard PLC format (40001, 30001, etc.)
  const standardMatch = trimmed.match(/^(\d{5})$/)
  if (standardMatch) {
    const addr = parseInt(standardMatch[1], 10)
    const result = fromStandardPlcAddress(addr)
    if (!result) return null

    return {
      vendor: 'standard',
      registerType: result.registerType,
      address: result.modbusAddress,
      displayAddress: addressStr.trim()
    }
  }

  // Mitsubishi format (D0, X0, Y0, etc.)
  const mitsubishiMatch = trimmed.match(/^([DXYMS])(\d+)$/)
  if (mitsubishiMatch) {
    const device = mitsubishiMatch[1]
    const addr = parseInt(mitsubishiMatch[2], 10)

    let registerType: RegisterType
    if (device === 'D') registerType = 'holding_registers'
    else if (device === 'X') registerType = 'discrete_inputs'
    else if (device === 'Y') registerType = 'coils'
    else registerType = 'holding_registers' // M devices mapped to coils

    return {
      vendor: 'mitsubishi',
      registerType,
      address: addr,
      displayAddress: addressStr.trim()
    }
  }

  return null
}

/**
 * Format Modbus address to PLC display format
 */
export function formatPlcAddress(
  vendor: PlcVendor,
  registerType: RegisterType,
  modbusAddress: number
): string {
  switch (vendor) {
    case 'siemens':
      return toSiemensAddress(registerType, modbusAddress)
    case 'standard':
      return toStandardPlcAddress(registerType, modbusAddress)
    case 'mitsubishi':
      const prefix =
        registerType === 'holding_registers'
          ? 'D'
          : registerType === 'discrete_inputs'
            ? 'X'
            : registerType === 'coils'
              ? 'Y'
              : 'M'
      return `${prefix}${modbusAddress}`
    default:
      return String(modbusAddress)
  }
}

/**
 * Validate if an address string is valid for the given vendor
 */
export function validatePlcAddress(
  addressStr: string,
  expectedRegisterType?: RegisterType
): boolean {
  const parsed = parsePlcAddress(addressStr)
  if (!parsed) return false
  if (expectedRegisterType && parsed.registerType !== expectedRegisterType) return false
  return true
}

/**
 * Get address range info for a vendor
 */
export function getPlcAddressRange(vendor: PlcVendor, registerType: RegisterType): PlcAddressRange {
  switch (vendor) {
    case 'siemens':
      return SIEMENS_RANGES[registerType]
    case 'standard':
    default:
      return STANDARD_RANGES[registerType]
  }
}

/**
 * Convert a range of addresses
 */
export function convertAddressRange(
  vendor: PlcVendor,
  registerType: RegisterType,
  startAddress: number,
  count: number
): Array<{ modbusAddress: number; plcAddress: string }> {
  const result: Array<{ modbusAddress: number; plcAddress: string }> = []

  for (let i = 0; i < count; i++) {
    const modbusAddr = startAddress + i
    const plcAddr = formatPlcAddress(vendor, registerType, modbusAddr)
    result.push({ modbusAddress: modbusAddr, plcAddress: plcAddr })
  }

  return result
}
