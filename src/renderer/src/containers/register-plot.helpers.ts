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

export const canSelectInterpretationAtAddress = (
  selectedAddresses: Set<number>,
  address: number,
  mode: PlotInterpretation
): boolean => {
  const span = getWordSpanForInterpretation(mode)
  if (span <= 1) return true
  for (let i = 0; i < span; i++) {
    if (!selectedAddresses.has(address + i)) return false
  }
  return true
}

export const getBatchAssignableAddresses = (
  selectedAddresses: Set<number>,
  mode: PlotInterpretation
): number[] => {
  const span = getWordSpanForInterpretation(mode)
  const sorted = [...selectedAddresses].sort((a, b) => a - b)
  if (sorted.length === 0) return []
  if (span === 1) return sorted

  const starts: number[] = []
  let segmentStart = 0

  const flushSegment = (endExclusive: number): boolean => {
    const segment = sorted.slice(segmentStart, endExclusive)
    if (segment.length % span !== 0) return false
    for (let i = 0; i < segment.length; i += span) {
      starts.push(segment[i])
    }
    return true
  }

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      if (!flushSegment(i)) return []
      segmentStart = i
    }
  }

  if (!flushSegment(sorted.length)) return []
  return starts
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

const PLOT_COLORS = [
  '#1976d2',
  '#d32f2f',
  '#2e7d32',
  '#ed6c02',
  '#7b1fa2',
  '#00838f',
  '#5d4037',
  '#455a64'
]

const PLOT_SELECTION_BG = [
  'rgba(33, 150, 243, 0.16)',
  'rgba(244, 67, 54, 0.16)',
  'rgba(76, 175, 80, 0.16)',
  'rgba(255, 152, 0, 0.16)',
  'rgba(156, 39, 176, 0.14)',
  'rgba(0, 188, 212, 0.14)',
  'rgba(121, 85, 72, 0.14)',
  'rgba(96, 125, 139, 0.14)'
]

export const getRegisterColor = (address: number): string => {
  return PLOT_COLORS[Math.abs(address) % PLOT_COLORS.length]
}

export const getPlotSelectionColor = (seed: number): string => {
  return PLOT_SELECTION_BG[Math.abs(seed) % PLOT_SELECTION_BG.length]
}
