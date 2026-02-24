/**
 * Modbus Packet Parser
 *
 * Parses Modbus TCP/RTU packets for display in communication monitor
 */

import type { ServerCommPacket, PacketStats } from '../types/comm'

// Modbus function codes
export const FUNCTION_CODES: Record<number, string> = {
  0x01: 'Read Coils',
  0x02: 'Read Discrete Inputs',
  0x03: 'Read Holding Registers',
  0x04: 'Read Input Registers',
  0x05: 'Write Single Coil',
  0x06: 'Write Single Register',
  0x0f: 'Write Multiple Coils',
  0x10: 'Write Multiple Registers',
  0x14: 'Read File Record',
  0x15: 'Write File Record',
  0x16: 'Mask Write Register',
  0x17: 'Read/Write Multiple Registers',
  0x18: 'Read FIFO Queue',
  0x2b: 'Encapsulated Interface Transport'
}

// Exception codes
export const EXCEPTION_CODES: Record<number, string> = {
  0x01: 'Illegal Function',
  0x02: 'Illegal Data Address',
  0x03: 'Illegal Data Value',
  0x04: 'Server Device Failure',
  0x05: 'Acknowledge',
  0x06: 'Server Device Busy',
  0x08: 'Memory Parity Error',
  0x0a: 'Gateway Path Unavailable',
  0x0b: 'Gateway Target Device Failed'
}

export interface ParsedPacket {
  transactionId?: number
  protocolId?: number
  length?: number
  unitId: number
  functionCode: number
  isException: boolean
  exceptionCode?: number
  exceptionText?: string
  data: ParsedData
  raw: string
  description: string
}

export interface ParsedData {
  startAddress?: number
  quantity?: number
  values?: number[]
  byteCount?: number
  coilStates?: boolean[]
  registerValues?: number[]
  referenceType?: number
  fileNumber?: number
  recordNumber?: number
  recordLength?: number
}

/**
 * Parse a Modbus TCP packet
 */
export function parseModbusTcpPacket(data: Uint8Array): ParsedPacket | null {
  if (data.length < 8) return null

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  const transactionId = view.getUint16(0)
  const protocolId = view.getUint16(2)
  const length = view.getUint16(4)
  const unitId = data[6]
  const functionCode = data[7]

  // Check if exception response (high bit set in function code)
  const isException = (functionCode & 0x80) !== 0
  const actualFunctionCode = isException ? functionCode & 0x7f : functionCode

  const parsed: ParsedPacket = {
    transactionId,
    protocolId,
    length,
    unitId,
    functionCode: actualFunctionCode,
    isException,
    data: {},
    raw: formatHex(data),
    description: ''
  }

  if (isException) {
    parsed.exceptionCode = data[8]
    parsed.exceptionText =
      EXCEPTION_CODES[parsed.exceptionCode] || `Unknown Exception (${parsed.exceptionCode})`
    parsed.description = `Exception: ${parsed.exceptionText}`
    return parsed
  }

  // Parse based on function code
  parsed.data = parseFunctionData(actualFunctionCode, data.slice(8))
  parsed.description = generateDescription(parsed)

  return parsed
}

/**
 * Parse function-specific data
 */
function parseFunctionData(functionCode: number, data: Uint8Array): ParsedData {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const result: ParsedData = {}

  switch (functionCode) {
    case 0x01: // Read Coils
    case 0x02: // Read Discrete Inputs
      if (data.length === 4) {
        // Request
        result.startAddress = view.getUint16(0)
        result.quantity = view.getUint16(2)
      } else if (data.length >= 1) {
        // Response
        result.byteCount = data[0]
        result.coilStates = parseBits(data.slice(1), result.byteCount * 8)
      }
      break

    case 0x03: // Read Holding Registers
    case 0x04: // Read Input Registers
      if (data.length === 4) {
        // Request
        result.startAddress = view.getUint16(0)
        result.quantity = view.getUint16(2)
      } else if (data.length >= 1) {
        // Response
        result.byteCount = data[0]
        result.registerValues = []
        for (let i = 0; i < result.byteCount / 2; i++) {
          result.registerValues.push(view.getUint16(1 + i * 2))
        }
      }
      break

    case 0x05: // Write Single Coil
      result.startAddress = view.getUint16(0)
      result.values = [view.getUint16(2)]
      break

    case 0x06: // Write Single Register
      result.startAddress = view.getUint16(0)
      result.registerValues = [view.getUint16(2)]
      break

    case 0x0f: // Write Multiple Coils
      if (data.length >= 5) {
        result.startAddress = view.getUint16(0)
        result.quantity = view.getUint16(2)
        result.byteCount = data[4]
      }
      break

    case 0x10: // Write Multiple Registers
      if (data.length >= 5) {
        result.startAddress = view.getUint16(0)
        result.quantity = view.getUint16(2)
        result.byteCount = data[4]
        result.registerValues = []
        for (let i = 0; i < result.quantity; i++) {
          result.registerValues.push(view.getUint16(5 + i * 2))
        }
      }
      break
  }

  return result
}

/**
 * Parse bits from byte array
 */
function parseBits(data: Uint8Array, count: number): boolean[] {
  const bits: boolean[] = []
  for (let i = 0; i < count; i++) {
    const byteIndex = Math.floor(i / 8)
    const bitIndex = i % 8
    if (byteIndex < data.length) {
      bits.push(((data[byteIndex] >> bitIndex) & 1) === 1)
    }
  }
  return bits
}

/**
 * Generate human-readable description
 */
function generateDescription(packet: ParsedPacket): string {
  const funcName =
    FUNCTION_CODES[packet.functionCode] ||
    `Function 0x${packet.functionCode.toString(16).padStart(2, '0')}`

  if (packet.isException) {
    return `${funcName} - Exception: ${packet.exceptionText}`
  }

  const data = packet.data

  switch (packet.functionCode) {
    case 0x01:
    case 0x02:
      if (data.startAddress !== undefined) {
        return `${funcName} - Start: ${data.startAddress}, Count: ${data.quantity}`
      } else if (data.coilStates) {
        const trueCount = data.coilStates.filter(Boolean).length
        return `${funcName} - ${data.coilStates.length} coils (${trueCount} ON)`
      }
      break

    case 0x03:
    case 0x04:
      if (data.startAddress !== undefined) {
        return `${funcName} - Start: ${data.startAddress}, Count: ${data.quantity}`
      } else if (data.registerValues) {
        const values = data.registerValues.slice(0, 3).join(', ')
        const more =
          data.registerValues.length > 3 ? ` (+${data.registerValues.length - 3} more)` : ''
        return `${funcName} - ${data.registerValues.length} registers: [${values}${more}]`
      }
      break

    case 0x05:
      if (data.startAddress !== undefined) {
        const value = data.values?.[0]
        const state =
          value === 0xff00
            ? 'ON'
            : value === 0x0000
              ? 'OFF'
              : `0x${value?.toString(16).padStart(4, '0')}`
        return `${funcName} - Address: ${data.startAddress}, Value: ${state}`
      }
      break

    case 0x06:
      if (data.startAddress !== undefined) {
        return `${funcName} - Address: ${data.startAddress}, Value: ${data.registerValues?.[0]}`
      }
      break

    case 0x0f:
    case 0x10:
      if (data.startAddress !== undefined) {
        return `${funcName} - Start: ${data.startAddress}, Count: ${data.quantity}`
      }
      break
  }

  return funcName
}

/**
 * Format bytes as hex string
 */
export function formatHex(data: Uint8Array, separator = ' '): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(separator)
}

/**
 * Format bytes as ASCII (printable chars only)
 */
export function formatAscii(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
    .join('')
}

/**
 * Analyze packet statistics
 */
export function analyzePacketStats(packets: ServerCommPacket[]): PacketStats {
  const stats: PacketStats = {
    totalPackets: packets.length,
    rxCount: 0,
    txCount: 0,
    exceptionCount: 0,
    bytesTransferred: 0,
    bufferBytes: 0,
    bufferLimitBytes: 0
  }

  const functionCodeCounts: Record<number, number> = {}

  for (const packet of packets) {
    stats.bytesTransferred += packet.data.length
    stats.bufferBytes += packet.data.length

    if (packet.direction === 'RX') {
      stats.rxCount++
    } else {
      stats.txCount++
    }

    const parsed = parseModbusTcpPacket(packet.data)
    if (parsed) {
      if (parsed.isException) {
        stats.exceptionCount++
      }

      functionCodeCounts[parsed.functionCode] = (functionCodeCounts[parsed.functionCode] || 0) + 1
    }
  }

  stats.bufferLimitBytes = stats.bufferBytes

  return stats
}

/**
 * Filter packets by criteria
 */
export function filterPackets(
  packets: ServerCommPacket[],
  filters: {
    direction?: 'RX' | 'TX'
    functionCode?: number
    unitId?: number
    hasException?: boolean
    startTime?: number
    endTime?: number
  }
): ServerCommPacket[] {
  return packets.filter((packet) => {
    if (filters.direction && packet.direction !== filters.direction) return false
    if (filters.startTime && packet.timestamp < filters.startTime) return false
    if (filters.endTime && packet.timestamp > filters.endTime) return false

    const parsed = parseModbusTcpPacket(packet.data)
    if (!parsed) return true // Include unparsable packets

    if (filters.functionCode !== undefined && parsed.functionCode !== filters.functionCode)
      return false
    if (filters.unitId !== undefined && parsed.unitId !== filters.unitId) return false
    if (filters.hasException !== undefined && parsed.isException !== filters.hasException)
      return false

    return true
  })
}

/**
 * Export packets to CSV format
 */
export function exportPacketsToCsv(packets: ServerCommPacket[]): string {
  const headers = [
    'ID',
    'Timestamp',
    'Direction',
    'Unit ID',
    'Function',
    'Description',
    'Raw Data (Hex)'
  ]
  const rows = [headers.join(',')]

  for (const packet of packets) {
    const parsed = parseModbusTcpPacket(packet.data)
    const row = [
      packet.id,
      new Date(packet.timestamp).toISOString(),
      packet.direction,
      parsed?.unitId ?? '-',
      parsed ? `0x${parsed.functionCode.toString(16).padStart(2, '0')}` : '-',
      parsed?.description ?? 'Unparsable',
      formatHex(packet.data)
    ]
    rows.push(row.join(','))
  }

  return rows.join('\n')
}
