import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AppBar,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  TextField,
  Toolbar,
  Typography
} from '@mui/material'
import type { PacketStats, ServerCommPacket, SystemLogEntry, SystemLogStats } from '@shared'
import { onEvent } from '@renderer/events'
import {
  GLOBAL_LOG_BUFFER_MB_KEY,
  GLOBAL_MONO_FONT_SIZE_KEY,
  GLOBAL_PREFERENCE_CHANGE_EVENT,
  type GlobalPreferenceChangeDetail,
  getGlobalLogBufferSizePreference,
  getGlobalMonoFontSizePreference
} from '@renderer/settings/global-preferences'

const MONO_FONT_FAMILY = 'var(--modbux-mono-font, "Iosevka", "Cascadia Mono", "Consolas", monospace)'
const MONO_FONT_SIZE = 'var(--modbux-mono-font-size, 13px)'
const OVERSCAN = 12

interface CommLogEntry {
  id: number
  kind: 'comm' | 'log'
  timestamp: number
  direction: 'RX' | 'TX' | 'LOG'
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  module: string
  message: string
  protocol: string
  frameType: string
  clientAddr: string
  slaveId: number
  functionCode: number
  dataHex: string
  isException: boolean
  exceptionCode?: number
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
  if (raw === 'level' || raw === 'lvl') return 'level'
  if (raw === 'source' || raw === 'src') return 'source'
  if (raw === 'module' || raw === 'mod') return 'module'
  if (raw === 'message' || raw === 'msg') return 'message'
  if (raw === 'kind') return 'kind'
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
    if (token.toLowerCase() === 'not' || token === '!') {
      return { type: 'not', expr: parsePrimary() }
    }

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
      return {
        type: 'comparison',
        field,
        op: opMap[opToken.toLowerCase()],
        value: parseValue(valueToken)
      }
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
  if (idx < tokens.length) {
    throw new Error(`Unexpected token "${tokens[idx]}"`)
  }
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
      case 'level':
        return entry.level
      case 'source':
        return entry.source
      case 'module':
        return entry.module
      case 'message':
        return entry.message
      case 'kind':
        return entry.kind
      default:
        return ''
    }
  }

  if (ast.type === 'binary') {
    return ast.op === 'and'
      ? evalFilter(ast.left, entry) && evalFilter(ast.right, entry)
      : evalFilter(ast.left, entry) || evalFilter(ast.right, entry)
  }
  if (ast.type === 'not') {
    return !evalFilter(ast.expr, entry)
  }
  if (ast.type === 'field') {
    return Boolean(getFieldValue(ast.field))
  }

  const left = getFieldValue(ast.field)
  const right = ast.value

  if (ast.op === 'contains') {
    return String(left).toLowerCase().includes(String(right).toLowerCase())
  }
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
    kind: 'comm',
    timestamp: packet.timestamp,
    direction: packet.direction,
    level: isException ? 'error' : 'info',
    source: 'comm',
    module: `modbus.${packet.protocol.toLowerCase()}`,
    message: isException ? `Exception FC ${packet.functionCode}` : `FC ${packet.functionCode}`,
    protocol: packet.protocol,
    frameType: packet.frameType,
    clientAddr: packet.clientAddr,
    slaveId: packet.slaveId,
    functionCode: packet.functionCode,
    dataHex,
    isException,
    exceptionCode: exc,
    line,
    sizeBytes
  }
}

const buildSystemLogEntry = (entry: SystemLogEntry): CommLogEntry => {
  const timestamp = new Date(entry.timestamp).toISOString().split('T')[1].slice(0, 12)
  const details =
    entry.details === undefined
      ? ''
      : typeof entry.details === 'string'
        ? entry.details
        : JSON.stringify(entry.details)
  const line = `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.source}/${entry.module} | ${entry.message}${details ? ` | ${details}` : ''}`
  const sizeBytes = 96 + line.length * 2

  return {
    id: entry.id,
    kind: 'log',
    timestamp: entry.timestamp,
    direction: 'LOG',
    level: entry.level,
    source: entry.source,
    module: entry.module,
    message: entry.message,
    protocol: '-',
    frameType: '-',
    clientAddr: '-',
    slaveId: entry.slaveId ?? 0,
    functionCode: 0,
    dataHex: '',
    isException: entry.level === 'error',
    exceptionCode: undefined,
    line,
    sizeBytes
  }
}

const CommLogWindow = (): JSX.Element => {
  const { t } = useTranslation()
  const [monoFontSize, setMonoFontSize] = useState<number>(getGlobalMonoFontSizePreference)
  const [renderBufferLimitMb, setRenderBufferLimitMb] = useState<number>(getGlobalLogBufferSizePreference)
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filterInput, setFilterInput] = useState('')
  const [filterError, setFilterError] = useState<string | null>(null)
  const [renderVersion, setRenderVersion] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(400)
  const [stats, setStats] = useState<PacketStats | null>(null)
  const [systemLogStats, setSystemLogStats] = useState<SystemLogStats | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const entriesRef = useRef<CommLogEntry[]>([])
  const filteredIndicesRef = useRef<number[]>([])
  const bufferBytesRef = useRef(0)
  const pendingRef = useRef<ServerCommPacket[]>([])
  const pendingSystemLogsRef = useRef<SystemLogEntry[]>([])
  const compiledFilterRef = useRef<FilterAst | null>(null)
  const filterDirtyRef = useRef(true)
  const renderBufferLimitBytesRef = useRef(renderBufferLimitMb * 1024 * 1024)
  const lineHeight = useMemo(() => Math.max(24, monoFontSize + 10), [monoFontSize])

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

  const rebuildFilteredIndices = useCallback(() => {
    const entries = entriesRef.current
    const next: number[] = []
    const ast = compiledFilterRef.current
    for (let i = 0; i < entries.length; i++) {
      if (!ast || evalFilter(ast, entries[i])) {
        next.push(i)
      }
    }
    filteredIndicesRef.current = next
  }, [])

  const appendPacket = useCallback(
    (packet: ServerCommPacket) => {
      const entry = buildEntry(packet)
      entriesRef.current.push(entry)
      bufferBytesRef.current += entry.sizeBytes

      let trimmed = 0
      while (bufferBytesRef.current > renderBufferLimitBytesRef.current && entriesRef.current.length > 0) {
        const first = entriesRef.current.shift()
        if (!first) break
        bufferBytesRef.current -= first.sizeBytes
        trimmed++
      }

      if (trimmed > 0) {
        filterDirtyRef.current = true
      }

      if (filterDirtyRef.current) {
        rebuildFilteredIndices()
        filterDirtyRef.current = false
      } else {
        const idx = entriesRef.current.length - 1
        const ast = compiledFilterRef.current
        if (!ast || evalFilter(ast, entry)) {
          filteredIndicesRef.current.push(idx)
        }
      }
    },
    [rebuildFilteredIndices]
  )

  useEffect(() => {
    const packetUnlisten = onEvent('comm_packet', (packet) => {
      if (paused) return
      pendingRef.current.push(packet)
    })
    const systemLogUnlisten = onEvent('system_log_entry', (entry) => {
      if (paused) return
      pendingSystemLogsRef.current.push(entry)
    })
    const clearUnlisten = onEvent('comm_monitor_clear', () => {
      entriesRef.current = []
      filteredIndicesRef.current = []
      bufferBytesRef.current = 0
      pendingRef.current = []
      pendingSystemLogsRef.current = []
      setRenderVersion((v) => v + 1)
    })
    const clearSystemLogUnlisten = onEvent('system_log_clear', () => {
      entriesRef.current = []
      filteredIndicesRef.current = []
      bufferBytesRef.current = 0
      pendingRef.current = []
      pendingSystemLogsRef.current = []
      setRenderVersion((v) => v + 1)
    })

    return () => {
      packetUnlisten()
      systemLogUnlisten()
      clearUnlisten()
      clearSystemLogUnlisten()
    }
  }, [paused])

  useEffect(() => {
    window.api
      .getSystemLogs(10000)
      .then((logs) => {
        if (!Array.isArray(logs) || logs.length === 0) return
        const mapped = logs.map(buildSystemLogEntry)
        entriesRef.current = [...entriesRef.current, ...mapped]
        bufferBytesRef.current += mapped.reduce((sum, entry) => sum + entry.sizeBytes, 0)
        trimEntriesToLimit()
        filterDirtyRef.current = true
        rebuildFilteredIndices()
        setRenderVersion((v) => v + 1)
      })
      .catch(() => undefined)
  }, [rebuildFilteredIndices, trimEntriesToLimit])

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
      if (pendingRef.current.length === 0 && pendingSystemLogsRef.current.length === 0) return
      const packets = pendingRef.current.splice(0, pendingRef.current.length)
      packets.forEach(appendPacket)

      const logs = pendingSystemLogsRef.current.splice(0, pendingSystemLogsRef.current.length)
      logs.forEach((item) => {
        const entry = buildSystemLogEntry(item)
        entriesRef.current.push(entry)
        bufferBytesRef.current += entry.sizeBytes
      })

      trimEntriesToLimit()

      filterDirtyRef.current = true
      rebuildFilteredIndices()
      setRenderVersion((v) => v + 1)
    }, 50)

    return () => {
      window.clearInterval(timer)
    }
  }, [appendPacket, rebuildFilteredIndices, trimEntriesToLimit])

  useEffect(() => {
    const timer = window.setInterval(() => {
      window.api
        .getCommStats()
        .then((next) => setStats(next))
        .catch(() => undefined)
      window.api
        .getSystemLogStats()
        .then((next) => setSystemLogStats(next))
        .catch(() => undefined)
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const syncFontSize = (): void => {
      setMonoFontSize(getGlobalMonoFontSizePreference())
    }

    const onStorage = (event: StorageEvent): void => {
      if (event.key === GLOBAL_MONO_FONT_SIZE_KEY) {
        syncFontSize()
      }
      if (event.key === GLOBAL_LOG_BUFFER_MB_KEY) {
        setRenderBufferLimitMb(getGlobalLogBufferSizePreference())
      }
    }

    const onPreferenceChange = (event: Event): void => {
      const customEvent = event as CustomEvent<GlobalPreferenceChangeDetail>
      if (customEvent.detail?.key === GLOBAL_MONO_FONT_SIZE_KEY) {
        syncFontSize()
      }
      if (customEvent.detail?.key === GLOBAL_LOG_BUFFER_MB_KEY) {
        setRenderBufferLimitMb(getGlobalLogBufferSizePreference())
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
    })
    observer.observe(container)
    setViewportHeight(container.clientHeight)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return
    containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [renderVersion, autoScroll])

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return
    containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [autoScroll])

  const filteredIndices = filteredIndicesRef.current
  const totalRows = filteredIndices.length
  const startIndex = Math.max(0, Math.floor(scrollTop / lineHeight) - OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight / lineHeight) + OVERSCAN * 2
  const endIndex = Math.min(totalRows, startIndex + visibleCount)
  const visibleRows = useMemo(() => {
    const rows: Array<{ offset: number; entry: CommLogEntry }> = []
    for (let i = startIndex; i < endIndex; i++) {
      const entryIndex = filteredIndices[i]
      const entry = entriesRef.current[entryIndex]
      if (!entry) continue
      rows.push({ offset: i * lineHeight, entry })
    }
    return rows
  }, [startIndex, endIndex, filteredIndices, renderVersion, lineHeight])

  const handleFilterChange = (value: string): void => {
    try {
      if (value.trim()) parseFilter(value)
      setFilterInput(value)
    } catch (error) {
      setFilterInput(value)
      setFilterError(error instanceof Error ? error.message : 'Invalid filter')
    }
  }

  const handleScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const target = event.currentTarget
    setScrollTop(target.scrollTop)
  }

  const handleClear = useCallback(() => {
    entriesRef.current = []
    filteredIndicesRef.current = []
    pendingRef.current = []
    pendingSystemLogsRef.current = []
    bufferBytesRef.current = 0
    setRenderVersion((v) => v + 1)
    window.api.clearCommMonitor()
    window.api.clearSystemLogs()
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

  return (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense" sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', mr: 1 }}>
            {t('server.toolbar.commDetails')}
          </Typography>
          <TextField
            size="small"
            value={filterInput}
            onChange={(e) => handleFilterChange(e.target.value)}
            placeholder='Filter (e.g. kind == comm and direction == RX and fc == 3) or (level == error)'
            error={Boolean(filterError)}
            helperText={
              filterError ||
              'Fields: kind/direction/fc/unit/data/level/source/module/message/exception'
            }
            sx={{ minWidth: 460, maxWidth: 720 }}
          />
          <Chip label={`Rows: ${renderedSummary}`} size="small" />
          <Chip label={`Buffer: ${bufferSummary}`} size="small" />
          <Chip label={`Logs: ${systemLogStats?.total ?? 0}`} size="small" />
          <Chip label={`Log Errors: ${systemLogStats?.byLevel.error ?? 0}`} size="small" color="error" variant="outlined" />
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
        </Toolbar>
      </AppBar>

      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#0e1218' : '#f7fbff'),
          color: 'text.primary',
          fontFamily: MONO_FONT_FAMILY,
          fontSize: MONO_FONT_SIZE,
          overflow: 'auto',
          position: 'relative'
        }}
      >
        {totalRows === 0 ? (
          <Typography color="text.secondary" sx={{ fontStyle: 'italic', p: 1.5 }}>
            {t('transaction.noData')}
          </Typography>
        ) : (
          <Box sx={{ position: 'relative', height: totalRows * lineHeight }}>
            {visibleRows.map(({ offset, entry }) => (
              <Box
                key={`${entry.kind}-${entry.id}-${entry.timestamp}`}
                sx={(theme) => ({
                  position: 'absolute',
                  top: offset,
                  left: 0,
                  right: 0,
                  height: lineHeight,
                  px: 1,
                  display: 'flex',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: `${lineHeight}px`,
                  bgcolor: entry.isException
                    ? 'rgba(244,67,54,0.15)'
                    : entry.direction === 'RX'
                      ? theme.palette.mode === 'dark'
                        ? 'rgba(25,118,210,0.16)'
                        : 'rgba(25,118,210,0.08)'
                      : entry.direction === 'TX'
                        ? theme.palette.mode === 'dark'
                          ? 'rgba(46,125,50,0.16)'
                          : 'rgba(46,125,50,0.08)'
                        : theme.palette.mode === 'dark'
                          ? 'rgba(158,158,158,0.2)'
                          : 'rgba(158,158,158,0.08)',
                  color: entry.isException
                    ? 'error.main'
                    : entry.direction === 'RX'
                      ? theme.palette.mode === 'dark'
                        ? '#90caf9'
                        : '#0d47a1'
                      : entry.direction === 'TX'
                        ? theme.palette.mode === 'dark'
                          ? '#a5d6a7'
                          : '#1b5e20'
                        : theme.palette.mode === 'dark'
                          ? '#e0e0e0'
                          : '#424242',
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
