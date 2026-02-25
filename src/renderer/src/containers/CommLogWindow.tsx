import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppBar, Box, Button, Checkbox, Chip, FormControlLabel, TextField, Toolbar, Typography } from '@mui/material'
import type { PacketStats, ServerCommPacket } from '@shared'
import { onEvent } from '@renderer/events'
import { useWindowAlwaysOnTop } from '@renderer/hooks/useWindowAlwaysOnTop'
import {
  GLOBAL_COMM_BUFFER_MB_KEY,
  GLOBAL_MONO_FONT_SIZE_KEY,
  GLOBAL_PREFERENCE_CHANGE_EVENT,
  type GlobalPreferenceChangeDetail,
  getGlobalCommBufferSizePreference,
  getGlobalMonoFontSizePreference
} from '@renderer/settings/global-preferences'

const MONO_FONT_FAMILY = 'var(--modbux-mono-font, "Iosevka", "Cascadia Mono", "Consolas", monospace)'
const MONO_FONT_SIZE = 'var(--modbux-mono-font-size, 13px)'
const OVERSCAN = 12
const WINDOW_TITLEBAR_PADDING_TOP = 'calc(env(titlebar-area-height, 0px) + 10px)'

interface CommLogEntry {
  id: number
  timestamp: number
  direction: 'RX' | 'TX'
  protocol: string
  frameType: string
  clientAddr: string
  slaveId: number
  functionCode: number
  dataHex: string
  isException: boolean
  line: string
  sizeBytes: number
}

type CompareOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'matches'
type BoolOp = 'and' | 'or'
type FilterAst =
  | { type: 'binary'; op: BoolOp; left: FilterAst; right: FilterAst }
  | { type: 'not'; expr: FilterAst }
  | { type: 'comparison'; field: string; op: CompareOp; value: string | number }
  | { type: 'field'; field: string }

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

const normalizeField = (input: string): string => {
  const raw = input.toLowerCase()
  if (raw.includes('.')) {
    const tail = raw.split('.').pop()
    if (tail) return normalizeField(tail)
  }
  if (raw === 'dir') return 'direction'
  if (raw === 'unit' || raw === 'slave' || raw === 'unitid') return 'slaveid'
  if (raw === 'fc' || raw === 'function' || raw === 'functioncode') return 'functioncode'
  if (raw === 'proto') return 'protocol'
  if (raw === 'frame') return 'frametype'
  if (raw === 'client') return 'clientaddr'
  if (raw === 'exception' || raw === 'error') return 'exception'
  if (raw === 'data' || raw === 'payload') return 'data'
  return raw
}

const tokenizeFilter = (input: string): string[] => {
  const tokens: string[] = []
  const regex =
    /\s*(>=|<=|==|!=|&&|\|\||>|<|\(|\)|!|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\S+)\s*/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[1])
  }
  return tokens
}

const parseFilter = (input: string): FilterAst => {
  const tokens = tokenizeFilter(input)
  let idx = 0
  const peek = (): string | undefined => tokens[idx]
  const next = (): string | undefined => tokens[idx++]

  const parseValue = (token: string): string | number => {
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1)
    }
    if (/^0x[0-9a-f]+$/i.test(token)) return Number.parseInt(token, 16)
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token)
    return token
  }

  const parsePrimary = (): FilterAst => {
    const token = next()
    if (!token) throw new Error('Unexpected end of filter')
    if (token === '(') {
      const expr = parseOr()
      if (next() !== ')') throw new Error('Expected ")"')
      return expr
    }
    if (token.toLowerCase() === 'not' || token === '!') return { type: 'not', expr: parsePrimary() }

    const field = normalizeField(token)
    const opToken = peek()
    const opMap: Record<string, CompareOp> = {
      '==': '==',
      '!=': '!=',
      '>': '>',
      '>=': '>=',
      '<': '<',
      '<=': '<=',
      contains: 'contains',
      matches: 'matches'
    }
    if (opToken && opMap[opToken.toLowerCase()]) {
      next()
      const valueToken = next()
      if (!valueToken) throw new Error(`Expected value after "${opToken}"`)
      return { type: 'comparison', field, op: opMap[opToken.toLowerCase()], value: parseValue(valueToken) }
    }
    return { type: 'field', field }
  }

  const parseAnd = (): FilterAst => {
    let left = parsePrimary()
    while (true) {
      const token = peek()?.toLowerCase()
      if (token === 'and' || token === '&&') {
        next()
        left = { type: 'binary', op: 'and', left, right: parsePrimary() }
        continue
      }
      break
    }
    return left
  }

  const parseOr = (): FilterAst => {
    let left = parseAnd()
    while (true) {
      const token = peek()?.toLowerCase()
      if (token === 'or' || token === '||') {
        next()
        left = { type: 'binary', op: 'or', left, right: parseAnd() }
        continue
      }
      break
    }
    return left
  }

  const ast = parseOr()
  if (idx < tokens.length) throw new Error(`Unexpected token "${tokens[idx]}"`)
  return ast
}

const evalFilter = (ast: FilterAst, entry: CommLogEntry): boolean => {
  const getFieldValue = (field: string): string | number | boolean => {
    switch (normalizeField(field)) {
      case 'id':
        return entry.id
      case 'timestamp':
        return entry.timestamp
      case 'direction':
        return entry.direction
      case 'protocol':
        return entry.protocol
      case 'frametype':
        return entry.frameType
      case 'clientaddr':
        return entry.clientAddr
      case 'slaveid':
        return entry.slaveId
      case 'functioncode':
        return entry.functionCode
      case 'exception':
        return entry.isException
      case 'data':
        return entry.dataHex
      default:
        return ''
    }
  }

  if (ast.type === 'binary') return ast.op === 'and' ? evalFilter(ast.left, entry) && evalFilter(ast.right, entry) : evalFilter(ast.left, entry) || evalFilter(ast.right, entry)
  if (ast.type === 'not') return !evalFilter(ast.expr, entry)
  if (ast.type === 'field') return Boolean(getFieldValue(ast.field))

  const left = getFieldValue(ast.field)
  const right = ast.value
  if (ast.op === 'contains') return String(left).toLowerCase().includes(String(right).toLowerCase())
  if (ast.op === 'matches') {
    try {
      return new RegExp(String(right), 'i').test(String(left))
    } catch {
      return false
    }
  }

  if (typeof left === 'number' || typeof right === 'number') {
    const a = Number(left)
    const b = Number(right)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    if (ast.op === '==') return a === b
    if (ast.op === '!=') return a !== b
    if (ast.op === '>') return a > b
    if (ast.op === '>=') return a >= b
    if (ast.op === '<') return a < b
    return a <= b
  }

  const a = String(left).toLowerCase()
  const b = String(right).toLowerCase()
  if (ast.op === '==') return a === b
  if (ast.op === '!=') return a !== b
  if (ast.op === '>') return a > b
  if (ast.op === '>=') return a >= b
  if (ast.op === '<') return a < b
  return a <= b
}

const buildEntry = (packet: ServerCommPacket): CommLogEntry => {
  const timestamp = new Date(packet.timestamp).toISOString().split('T')[1].slice(0, 12)
  const slaveId = packet.slaveId.toString().padStart(3, '0')
  const dataHex = Array.from(packet.data)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
  const isException = Boolean(packet.parsed.isException || packet.parsed.exception !== undefined)
  const exc = packet.parsed.exception
  const line = `[${timestamp}] ${packet.direction} | Unit:${slaveId} | ${dataHex}${isException ? ` | EXC:${exc ?? 'ERR'}` : ''}`
  const sizeBytes = 128 + packet.data.byteLength + packet.clientAddr.length * 2 + line.length * 2

  return {
    id: packet.id,
    timestamp: packet.timestamp,
    direction: packet.direction,
    protocol: packet.protocol,
    frameType: packet.frameType,
    clientAddr: packet.clientAddr,
    slaveId: packet.slaveId,
    functionCode: packet.functionCode,
    dataHex,
    isException,
    line,
    sizeBytes
  }
}

const dedupePacketsById = (packets: ServerCommPacket[]): ServerCommPacket[] => {
  const packetMap = new Map<number, ServerCommPacket>()
  packets.forEach((packet) => {
    packetMap.set(packet.id, packet)
  })
  return [...packetMap.values()].sort((a, b) => a.id - b.id)
}

const CommLogWindow = (): JSX.Element => {
  const { t } = useTranslation()
  const { alwaysOnTop, setWindowAlwaysOnTop } = useWindowAlwaysOnTop()
  const [monoFontSize, setMonoFontSize] = useState<number>(getGlobalMonoFontSizePreference)
  const [renderBufferLimitMb, setRenderBufferLimitMb] = useState<number>(getGlobalCommBufferSizePreference)
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filterInput, setFilterInput] = useState('')
  const [filterError, setFilterError] = useState<string | null>(null)
  const [renderVersion, setRenderVersion] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(400)
  const [viewportWidth, setViewportWidth] = useState(800)
  const [stats, setStats] = useState<PacketStats | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const entriesRef = useRef<CommLogEntry[]>([])
  const filteredIndicesRef = useRef<number[]>([])
  const bufferBytesRef = useRef(0)
  const pendingRef = useRef<ServerCommPacket[]>([])
  const initialSnapshotReadyRef = useRef(false)
  const compiledFilterRef = useRef<FilterAst | null>(null)
  const filterDirtyRef = useRef(true)
  const renderBufferLimitBytesRef = useRef(renderBufferLimitMb * 1024 * 1024)
  const maxLineCharsRef = useRef(0)
  const lineHeight = useMemo(() => Math.max(24, monoFontSize + 10), [monoFontSize])

  const rebuildFilteredIndices = useCallback(() => {
    const entries = entriesRef.current
    const next: number[] = []
    const ast = compiledFilterRef.current
    for (let i = 0; i < entries.length; i++) {
      if (!ast || evalFilter(ast, entries[i])) next.push(i)
    }
    filteredIndicesRef.current = next
  }, [])

  const trimEntriesToLimit = useCallback(() => {
    while (
      bufferBytesRef.current > renderBufferLimitBytesRef.current &&
      entriesRef.current.length > 0
    ) {
      const first = entriesRef.current.shift()
      if (!first) break
      bufferBytesRef.current -= first.sizeBytes
    }
  }, [])

  const appendPacket = useCallback(
    (packet: ServerCommPacket) => {
      const entry = buildEntry(packet)
      entriesRef.current.push(entry)
      bufferBytesRef.current += entry.sizeBytes
      maxLineCharsRef.current = Math.max(maxLineCharsRef.current, entry.line.length)

      trimEntriesToLimit()

      if (filterDirtyRef.current) {
        rebuildFilteredIndices()
        filterDirtyRef.current = false
      } else {
        const idx = entriesRef.current.length - 1
        const ast = compiledFilterRef.current
        if (!ast || evalFilter(ast, entry)) filteredIndicesRef.current.push(idx)
      }
    },
    [rebuildFilteredIndices, trimEntriesToLimit]
  )

  useEffect(() => {
    window.api
      .getCommPackets(10000)
      .then((packets) => {
        const snapshotPackets = Array.isArray(packets) ? packets : []
        const queuedPackets = pendingRef.current.splice(0, pendingRef.current.length)
        const mergedPackets = dedupePacketsById([...snapshotPackets, ...queuedPackets])
        if (mergedPackets.length === 0) return
        const mapped = mergedPackets.map(buildEntry)
        entriesRef.current = mapped
        maxLineCharsRef.current = mapped.reduce((max, entry) => Math.max(max, entry.line.length), 0)
        bufferBytesRef.current = mapped.reduce((sum, entry) => sum + entry.sizeBytes, 0)
        trimEntriesToLimit()
        filterDirtyRef.current = true
        rebuildFilteredIndices()
        setRenderVersion((v) => v + 1)
      })
      .catch(() => undefined)
      .finally(() => {
        initialSnapshotReadyRef.current = true
      })
  }, [rebuildFilteredIndices, trimEntriesToLimit])

  useEffect(() => {
    const packetUnlisten = onEvent('comm_packet', (packet) => {
      if (paused) return
      pendingRef.current.push(packet)
    })
    const clearUnlisten = onEvent('comm_monitor_clear', () => {
      entriesRef.current = []
      filteredIndicesRef.current = []
      bufferBytesRef.current = 0
      pendingRef.current = []
      maxLineCharsRef.current = 0
      setRenderVersion((v) => v + 1)
    })
    return () => {
      packetUnlisten()
      clearUnlisten()
    }
  }, [paused])

  useEffect(() => {
    try {
      const ast = filterInput.trim() ? parseFilter(filterInput) : null
      compiledFilterRef.current = ast
      setFilterError(null)
      filterDirtyRef.current = true
      rebuildFilteredIndices()
      setRenderVersion((v) => v + 1)
    } catch (error) {
      setFilterError(error instanceof Error ? error.message : 'Invalid filter')
    }
  }, [filterInput, rebuildFilteredIndices])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!initialSnapshotReadyRef.current) return
      if (pendingRef.current.length === 0) return
      const packets = pendingRef.current.splice(0, pendingRef.current.length)
      packets.forEach(appendPacket)
      filterDirtyRef.current = true
      rebuildFilteredIndices()
      setRenderVersion((v) => v + 1)
    }, 50)
    return () => window.clearInterval(timer)
  }, [appendPacket, rebuildFilteredIndices])

  useEffect(() => {
    const timer = window.setInterval(() => {
      window.api.getCommStats().then(setStats).catch(() => undefined)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const syncFromGlobal = (): void => {
      setMonoFontSize(getGlobalMonoFontSizePreference())
      setRenderBufferLimitMb(getGlobalCommBufferSizePreference())
    }

    const onStorage = (event: StorageEvent): void => {
      if (event.key === GLOBAL_MONO_FONT_SIZE_KEY || event.key === GLOBAL_COMM_BUFFER_MB_KEY) syncFromGlobal()
    }
    const onPreferenceChange = (event: Event): void => {
      const customEvent = event as CustomEvent<GlobalPreferenceChangeDetail>
      if (
        customEvent.detail?.key === GLOBAL_MONO_FONT_SIZE_KEY ||
        customEvent.detail?.key === GLOBAL_COMM_BUFFER_MB_KEY
      ) {
        syncFromGlobal()
      }
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(GLOBAL_PREFERENCE_CHANGE_EVENT, onPreferenceChange as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(GLOBAL_PREFERENCE_CHANGE_EVENT, onPreferenceChange as EventListener)
    }
  }, [])

  useEffect(() => {
    renderBufferLimitBytesRef.current = renderBufferLimitMb * 1024 * 1024
    trimEntriesToLimit()
    filterDirtyRef.current = true
    rebuildFilteredIndices()
    setRenderVersion((v) => v + 1)
  }, [renderBufferLimitMb, rebuildFilteredIndices, trimEntriesToLimit])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      setViewportHeight(container.clientHeight)
      setViewportWidth(container.clientWidth)
    })
    observer.observe(container)
    setViewportHeight(container.clientHeight)
    setViewportWidth(container.clientWidth)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return
    containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [renderVersion, autoScroll])

  const filteredIndices = filteredIndicesRef.current
  const totalRows = filteredIndices.length
  const startIndex = Math.max(0, Math.floor(scrollTop / lineHeight) - OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight / lineHeight) + OVERSCAN * 2
  const endIndex = Math.min(totalRows, startIndex + visibleCount)
  const visibleRows = useMemo(() => {
    const rows: Array<{ offset: number; entry: CommLogEntry }> = []
    for (let i = startIndex; i < endIndex; i++) {
      const entry = entriesRef.current[filteredIndices[i]]
      if (entry) rows.push({ offset: i * lineHeight, entry })
    }
    return rows
  }, [startIndex, endIndex, filteredIndices, renderVersion, lineHeight])

  const handleClear = useCallback(() => {
    entriesRef.current = []
    filteredIndicesRef.current = []
    pendingRef.current = []
    bufferBytesRef.current = 0
    setRenderVersion((v) => v + 1)
    window.api.clearCommMonitor()
  }, [])

  const handleSave = useCallback(() => {
    const lines = filteredIndicesRef.current
      .map((idx) => entriesRef.current[idx]?.line)
      .filter((line): line is string => Boolean(line))
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comm-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const renderedSummary = `${totalRows} / ${entriesRef.current.length}`
  const bufferSummary = stats
    ? `${formatBytes(stats.bufferBytes)} / ${formatBytes(stats.bufferLimitBytes)}`
    : `${formatBytes(bufferBytesRef.current)} / ${formatBytes(renderBufferLimitBytesRef.current)}`
  const contentWidth = Math.max(viewportWidth, Math.ceil(maxLineCharsRef.current * monoFontSize * 0.62) + 24)

  return (
    <Box
      sx={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pt: WINDOW_TITLEBAR_PADDING_TOP
      }}
    >
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          boxShadow: '0 6px 18px rgba(15,23,42,0.1)'
        }}
      >
        <Toolbar variant="dense" sx={{ gap: 1, flexWrap: 'wrap', py: 0.4 }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', mr: 1 }}>
            {t('server.toolbar.commDetails')}
          </Typography>
          <TextField
            size="small"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            placeholder='Filter (e.g. direction == RX and fc == 3 and unit == 1)'
            error={Boolean(filterError)}
            helperText={filterError || 'Fields: direction/fc/unit/client/protocol/frame/data/exception'}
            sx={{ minWidth: 420, maxWidth: 720 }}
          />
          <Chip label={`Rows: ${renderedSummary}`} size="small" />
          <Chip label={`Buffer: ${bufferSummary}`} size="small" />
          <Chip label="RX" size="small" sx={{ bgcolor: '#1976d2', color: '#fff' }} />
          <Chip label="TX" size="small" sx={{ bgcolor: '#2e7d32', color: '#fff' }} />
          <Chip label={`Exceptions: ${stats?.exceptionCount ?? 0}`} color="error" size="small" variant="outlined" />
          <Button variant={paused ? 'contained' : 'outlined'} size="small" onClick={() => setPaused(false)} disabled={!paused}>
            {t('common.continue')}
          </Button>
          <Button variant={paused ? 'outlined' : 'contained'} size="small" onClick={() => setPaused(true)} disabled={paused}>
            {t('common.stop')}
          </Button>
          <Button variant="outlined" size="small" onClick={handleClear}>
            {t('common.clear')}
          </Button>
          <Button variant="outlined" size="small" onClick={handleSave} disabled={totalRows === 0}>
            {t('common.save')}
          </Button>
          <FormControlLabel
            control={<Checkbox checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} size="small" />}
            label={t('common.autoScroll')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={alwaysOnTop}
                onChange={(e) => setWindowAlwaysOnTop(e.target.checked)}
                size="small"
              />
            }
            label={t('common.alwaysOnTop')}
          />
        </Toolbar>
      </AppBar>

      <Box
        ref={containerRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        sx={{
          flex: 1,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#0e1218' : '#f7fbff'),
          color: 'text.primary',
          fontFamily: MONO_FONT_FAMILY,
          fontSize: MONO_FONT_SIZE,
          overflow: 'auto',
          overflowX: 'auto',
          position: 'relative'
        }}
      >
        {totalRows === 0 ? (
          <Typography color="text.secondary" sx={{ fontStyle: 'italic', p: 1.5 }}>
            {t('transaction.noData')}
          </Typography>
        ) : (
          <Box sx={{ position: 'relative', height: totalRows * lineHeight, width: contentWidth }}>
            {visibleRows.map(({ offset, entry }) => (
              <Box
                key={`${entry.id}-${entry.timestamp}`}
                sx={(theme) => ({
                  position: 'absolute',
                  top: offset,
                  left: 0,
                  width: contentWidth,
                  height: lineHeight,
                  px: 1,
                  display: 'flex',
                  alignItems: 'center',
                  whiteSpace: 'pre',
                  lineHeight: `${lineHeight}px`,
                  bgcolor: entry.isException
                    ? 'rgba(244,67,54,0.15)'
                    : entry.direction === 'RX'
                      ? theme.palette.mode === 'dark'
                        ? 'rgba(25,118,210,0.16)'
                        : 'rgba(25,118,210,0.08)'
                      : theme.palette.mode === 'dark'
                        ? 'rgba(46,125,50,0.16)'
                        : 'rgba(46,125,50,0.08)',
                  color: entry.isException
                    ? 'error.main'
                    : entry.direction === 'RX'
                      ? theme.palette.mode === 'dark'
                        ? '#90caf9'
                        : '#0d47a1'
                      : theme.palette.mode === 'dark'
                        ? '#a5d6a7'
                        : '#1b5e20',
                  borderBottom: '1px solid rgba(255,255,255,0.02)'
                })}
              >
                {entry.line}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default CommLogWindow
