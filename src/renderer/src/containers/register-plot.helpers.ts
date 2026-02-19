import type { PlotInterpretation } from '@shared'

const getWord = (rawRegisters: Record<number, number>, address: number): number | null => {
  const value = rawRegisters[address]
  if (value === undefined || value === null || Number.isNaN(value)) return null
  return value & 0xffff
}

export const getWordSpanForInterpretation = (mode: PlotInterpretation): number => {
  switch (mode) {
    case 'short':
    case 'ushort':
      return 1
    case 'int':
    case 'uint':
    case 'float':
      return 2
    case 'long':
    case 'ulong':
    case 'double':
      return 4
    default:
      return 1
  }
}

export const decodePlotValue = (
  rawRegisters: Record<number, number>,
  startAddress: number,
  mode: PlotInterpretation
): number | null => {
  const span = getWordSpanForInterpretation(mode)
  const words: number[] = []
  for (let i = 0; i < span; i++) {
    const word = getWord(rawRegisters, startAddress + i)
    if (word === null) return null
    words.push(word)
  }

  switch (mode) {
    case 'short': {
      const v = words[0]
      return v & 0x8000 ? v - 0x10000 : v
    }
    case 'ushort':
      return words[0]
    case 'int': {
      const u32 = (((words[0] << 16) >>> 0) | words[1]) >>> 0
      return u32 > 0x7fffffff ? u32 - 0x100000000 : u32
    }
    case 'uint':
      return (((words[0] << 16) >>> 0) | words[1]) >>> 0
    case 'long':
    case 'ulong': {
      const u64 =
        (BigInt(words[0]) << 48n) |
        (BigInt(words[1]) << 32n) |
        (BigInt(words[2]) << 16n) |
        BigInt(words[3])
      if (mode === 'ulong') return Number(u64)
      const signed = u64 > 0x7fffffffffffffffn ? u64 - 0x10000000000000000n : u64
      return Number(signed)
    }
    case 'float': {
      const buf = new ArrayBuffer(4)
      const view = new DataView(buf)
      view.setUint16(0, words[0], false)
      view.setUint16(2, words[1], false)
      return view.getFloat32(0, false)
    }
    case 'double': {
      const buf = new ArrayBuffer(8)
      const view = new DataView(buf)
      view.setUint16(0, words[0], false)
      view.setUint16(2, words[1], false)
      view.setUint16(4, words[2], false)
      view.setUint16(6, words[3], false)
      return view.getFloat64(0, false)
    }
    default:
      return null
  }
}

export const getRegisterColor = (address: number): string => {
  const hue = (address * 47) % 360
  return `hsl(${hue}, 75%, 82%)`
}
