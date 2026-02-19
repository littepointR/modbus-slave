export function calculateCRC16Modbus(data: Uint8Array | number[]): number {
  const bytes = Array.isArray(data) ? new Uint8Array(data) : data
  let crc = 0xffff

  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
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

export function calculateCRC16ModbusHex(hexString: string): string {
  const bytes = hexStringToBytes(hexString)
  const crc = calculateCRC16Modbus(bytes)
  const high = (crc >> 8) & 0xff
  const low = crc & 0xff
  return `${low.toString(16).padStart(2, '0').toUpperCase()} ${high.toString(16).padStart(2, '0').toUpperCase()}`
}

export function calculateLRC(data: Uint8Array | number[]): number {
  const bytes = Array.isArray(data) ? new Uint8Array(data) : data
  let lrc = 0

  for (let i = 0; i < bytes.length; i++) {
    lrc += bytes[i]
  }

  lrc = ((lrc ^ 0xff) + 1) & 0xff
  return lrc
}

export function calculateLRCHex(hexString: string): string {
  const bytes = hexStringToBytes(hexString)
  const lrc = calculateLRC(bytes)
  return lrc.toString(16).padStart(2, '0').toUpperCase()
}

export function hexStringToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/\s+/g, '').replace(/0x/gi, '')
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex string must have even number of characters')
  }

  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16)
  }
  return bytes
}

export function bytesToHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}

export function swapBytes(
  buffer: Uint8Array,
  order: 'ABCD' | 'CDAB' | 'BADC' | 'DCBA'
): Uint8Array {
  if (buffer.length !== 4) {
    throw new Error('swapBytes requires 4-byte buffer')
  }

  const result = new Uint8Array(4)
  const a = buffer[0]
  const b = buffer[1]
  const c = buffer[2]
  const d = buffer[3]

  switch (order) {
    case 'ABCD':
      return buffer
    case 'CDAB':
      result[0] = c
      result[1] = d
      result[2] = a
      result[3] = b
      break
    case 'BADC':
      result[0] = b
      result[1] = a
      result[2] = d
      result[3] = c
      break
    case 'DCBA':
      result[0] = d
      result[1] = c
      result[2] = b
      result[3] = a
      break
  }

  return result
}

export function floatToBytes(value: number, littleEndian = false): Uint8Array {
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setFloat32(0, value, littleEndian)
  return new Uint8Array(buffer)
}

export function bytesToFloat(bytes: Uint8Array, littleEndian = false): number {
  if (bytes.length !== 4) {
    throw new Error('bytesToFloat requires 4-byte buffer')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getFloat32(0, littleEndian)
}

export function doubleToBytes(value: number, littleEndian = false): Uint8Array {
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  view.setFloat64(0, value, littleEndian)
  return new Uint8Array(buffer)
}

export function bytesToDouble(bytes: Uint8Array, littleEndian = false): number {
  if (bytes.length !== 8) {
    throw new Error('bytesToDouble requires 8-byte buffer')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getFloat64(0, littleEndian)
}

export function longToBytes(value: number, littleEndian = false): Uint8Array {
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setInt32(0, value, littleEndian)
  return new Uint8Array(buffer)
}

export function bytesToLong(bytes: Uint8Array, littleEndian = false): number {
  if (bytes.length !== 4) {
    throw new Error('bytesToLong requires 4-byte buffer')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getInt32(0, littleEndian)
}

export function uint16ToBytes(value: number, littleEndian = false): Uint8Array {
  const buffer = new ArrayBuffer(2)
  const view = new DataView(buffer)
  view.setUint16(0, value, littleEndian)
  return new Uint8Array(buffer)
}

export function bytesToUint16(bytes: Uint8Array, littleEndian = false): number {
  if (bytes.length !== 2) {
    throw new Error('bytesToUint16 requires 2-byte buffer')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getUint16(0, littleEndian)
}
