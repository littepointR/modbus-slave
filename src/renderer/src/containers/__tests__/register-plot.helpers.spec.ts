import { describe, expect, it } from 'vitest'
import {
  decodePlotValue,
  getRegisterColor,
  getWordSpanForInterpretation
} from '../register-plot.helpers'
import type { PlotInterpretation } from '@shared'

describe('register-plot.helpers', () => {
  it.each([
    ['short', 1],
    ['ushort', 1],
    ['int', 2],
    ['uint', 2],
    ['float', 2],
    ['long', 4],
    ['ulong', 4],
    ['double', 4]
  ] as const)('returns expected word span for %s', (mode, expected) => {
    expect(getWordSpanForInterpretation(mode)).toBe(expected)
  })

  it('decodes signed and unsigned 16-bit values', () => {
    const raw = { 100: 0xffff }
    expect(decodePlotValue(raw, 100, 'short')).toBe(-1)
    expect(decodePlotValue(raw, 100, 'ushort')).toBe(65535)
  })

  it('decodes signed and unsigned 32-bit values', () => {
    const signedRaw = { 0: 0xffff, 1: 0xffff }
    const unsignedRaw = { 0: 0x0001, 1: 0x0000 }
    expect(decodePlotValue(signedRaw, 0, 'int')).toBe(-1)
    expect(decodePlotValue(unsignedRaw, 0, 'uint')).toBe(65536)
  })

  it('decodes 64-bit integer values', () => {
    const signedRaw = { 0: 0xffff, 1: 0xffff, 2: 0xffff, 3: 0xffff }
    const unsignedRaw = { 0: 0x0000, 1: 0x0000, 2: 0x0001, 3: 0x0000 }
    expect(decodePlotValue(signedRaw, 0, 'long')).toBe(-1)
    expect(decodePlotValue(unsignedRaw, 0, 'ulong')).toBe(65536)
  })

  it('decodes float and double values', () => {
    const floatRaw = { 0: 0x3fc0, 1: 0x0000 } // 1.5f
    const doubleRaw = { 0: 0x3ff8, 1: 0x0000, 2: 0x0000, 3: 0x0000 } // 1.5
    expect(decodePlotValue(floatRaw, 0, 'float')).toBeCloseTo(1.5, 6)
    expect(decodePlotValue(doubleRaw, 0, 'double')).toBeCloseTo(1.5, 10)
  })

  it('returns null when there are not enough words', () => {
    const raw = { 0: 0x1234 }
    const modes: PlotInterpretation[] = ['int', 'uint', 'float', 'long', 'ulong', 'double']
    modes.forEach((mode) => {
      expect(decodePlotValue(raw, 0, mode)).toBeNull()
    })
  })

  it('returns deterministic color per address', () => {
    expect(getRegisterColor(42)).toBe(getRegisterColor(42))
    expect(getRegisterColor(42)).not.toBe(getRegisterColor(43))
  })
})
