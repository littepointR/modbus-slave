export const GLOBAL_MONO_FONT_KEY = 'modbux.global.monoFont'
export const GLOBAL_MONO_FONT_SIZE_KEY = 'modbux.global.monoFontSize'
export const GLOBAL_STRING_ENCODING_KEY = 'modbux.global.stringEncoding'
export const GLOBAL_COMM_BUFFER_MB_KEY = 'modbux.global.commBufferMb'
export const GLOBAL_SYSTEM_LOG_BUFFER_MB_KEY = 'modbux.global.systemLogBufferMb'
export const GLOBAL_LEGACY_LOG_BUFFER_MB_KEY = 'modbux.global.logBufferMb'
export const GLOBAL_PREFERENCE_CHANGE_EVENT = 'modbux-global-preference-change'

export interface GlobalPreferenceChangeDetail {
  key: string
  value: string
}

export const GLOBAL_MONO_FONT_FALLBACK = '"Iosevka", "Cascadia Mono", "Consolas", monospace'
export const GLOBAL_DEFAULT_MONO_FONT = 'Iosevka'
export const GLOBAL_DEFAULT_MONO_FONT_SIZE = 13
export const GLOBAL_MIN_MONO_FONT_SIZE = 10
export const GLOBAL_MAX_MONO_FONT_SIZE = 24
export const GLOBAL_DEFAULT_LOG_BUFFER_MB = 100
export const GLOBAL_MIN_LOG_BUFFER_MB = 1
export const GLOBAL_MAX_LOG_BUFFER_MB = 1024

export const GLOBAL_MONO_FONT_CANDIDATES = [
  'Iosevka',
  'Cascadia Mono',
  'Consolas',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Menlo',
  'Monaco',
  'Courier New'
]

export const GLOBAL_STRING_ENCODING_OPTIONS = [
  'ASCII',
  'UTF-8',
  'UTF-16',
  'UTF-16BE',
  'UTF-16LE',
  'GB2312',
  'GBK',
  'GB18030',
  'ISO-8859-1'
] as const

const dispatchPreferenceChange = (key: string, value: string): void => {
  window.dispatchEvent(
    new CustomEvent<GlobalPreferenceChangeDetail>(GLOBAL_PREFERENCE_CHANGE_EVENT, {
      detail: { key, value }
    })
  )
}

const quoteFontName = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return GLOBAL_DEFAULT_MONO_FONT
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed
  }
  return `"${trimmed.replace(/"/g, '\\"')}"`
}

export const getGlobalMonoFontPreference = (): string => {
  return localStorage.getItem(GLOBAL_MONO_FONT_KEY)?.trim() || GLOBAL_DEFAULT_MONO_FONT
}

export const getGlobalMonoFontFamily = (fontName: string): string => {
  return `${quoteFontName(fontName)}, ${GLOBAL_MONO_FONT_FALLBACK}`
}

export const applyGlobalMonoFontPreference = (fontName: string): void => {
  document.documentElement.style.setProperty('--modbux-mono-font', getGlobalMonoFontFamily(fontName))
}

export const setGlobalMonoFontPreference = (fontName: string): void => {
  const value = fontName.trim() || GLOBAL_DEFAULT_MONO_FONT
  localStorage.setItem(GLOBAL_MONO_FONT_KEY, value)
  applyGlobalMonoFontPreference(value)
  dispatchPreferenceChange(GLOBAL_MONO_FONT_KEY, value)
}

const clampMonoFontSize = (value: number): number => {
  if (!Number.isFinite(value)) return GLOBAL_DEFAULT_MONO_FONT_SIZE
  return Math.max(GLOBAL_MIN_MONO_FONT_SIZE, Math.min(GLOBAL_MAX_MONO_FONT_SIZE, Math.round(value)))
}

export const getGlobalMonoFontSizePreference = (): number => {
  const raw = localStorage.getItem(GLOBAL_MONO_FONT_SIZE_KEY)
  if (!raw) return GLOBAL_DEFAULT_MONO_FONT_SIZE
  const parsed = Number.parseInt(raw, 10)
  return clampMonoFontSize(parsed)
}

export const applyGlobalMonoFontSizePreference = (fontSize: number): void => {
  document.documentElement.style.setProperty('--modbux-mono-font-size', `${clampMonoFontSize(fontSize)}px`)
}

export const setGlobalMonoFontSizePreference = (fontSize: number): void => {
  const value = clampMonoFontSize(fontSize)
  localStorage.setItem(GLOBAL_MONO_FONT_SIZE_KEY, String(value))
  applyGlobalMonoFontSizePreference(value)
  dispatchPreferenceChange(GLOBAL_MONO_FONT_SIZE_KEY, String(value))
}

const isGlobalEncoding = (value: string | null): value is (typeof GLOBAL_STRING_ENCODING_OPTIONS)[number] => {
  return typeof value === 'string' && GLOBAL_STRING_ENCODING_OPTIONS.includes(value as (typeof GLOBAL_STRING_ENCODING_OPTIONS)[number])
}

export const getGlobalStringEncodingPreference = (): string => {
  const stored = localStorage.getItem(GLOBAL_STRING_ENCODING_KEY)
  return isGlobalEncoding(stored) ? stored : 'UTF-8'
}

export const setGlobalStringEncodingPreference = (encoding: string): void => {
  const value = isGlobalEncoding(encoding) ? encoding : 'UTF-8'
  localStorage.setItem(GLOBAL_STRING_ENCODING_KEY, value)
  dispatchPreferenceChange(GLOBAL_STRING_ENCODING_KEY, value)
}

const clampLogBufferMb = (value: number): number => {
  if (!Number.isFinite(value)) return GLOBAL_DEFAULT_LOG_BUFFER_MB
  return Math.max(GLOBAL_MIN_LOG_BUFFER_MB, Math.min(GLOBAL_MAX_LOG_BUFFER_MB, Math.round(value)))
}

const parseWithLegacyFallback = (key: string): number => {
  const raw = localStorage.getItem(key) ?? localStorage.getItem(GLOBAL_LEGACY_LOG_BUFFER_MB_KEY)
  if (!raw) return GLOBAL_DEFAULT_LOG_BUFFER_MB
  const parsed = Number.parseInt(raw, 10)
  return clampLogBufferMb(parsed)
}

export const getGlobalCommBufferSizePreference = (): number => {
  return parseWithLegacyFallback(GLOBAL_COMM_BUFFER_MB_KEY)
}

export const setGlobalCommBufferSizePreference = (bufferMb: number): number => {
  const value = clampLogBufferMb(bufferMb)
  localStorage.setItem(GLOBAL_COMM_BUFFER_MB_KEY, String(value))
  dispatchPreferenceChange(GLOBAL_COMM_BUFFER_MB_KEY, String(value))
  return value
}

export const getGlobalSystemLogBufferSizePreference = (): number => {
  return parseWithLegacyFallback(GLOBAL_SYSTEM_LOG_BUFFER_MB_KEY)
}

export const setGlobalSystemLogBufferSizePreference = (bufferMb: number): number => {
  const value = clampLogBufferMb(bufferMb)
  localStorage.setItem(GLOBAL_SYSTEM_LOG_BUFFER_MB_KEY, String(value))
  dispatchPreferenceChange(GLOBAL_SYSTEM_LOG_BUFFER_MB_KEY, String(value))
  return value
}
