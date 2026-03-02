import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useTranslation } from 'react-i18next'
import type { SystemLogEntry, SystemLogStats } from '@shared'
import { onEvent } from '@renderer/events'
import { useWindowAlwaysOnTop } from '@renderer/hooks/useWindowAlwaysOnTop'
import {
  GLOBAL_SYSTEM_LOG_BUFFER_MB_KEY,
  GLOBAL_MONO_FONT_SIZE_KEY,
  GLOBAL_PREFERENCE_CHANGE_EVENT,
  type GlobalPreferenceChangeDetail,
  getGlobalSystemLogBufferSizePreference,
  getGlobalMonoFontSizePreference
} from '@renderer/settings/global-preferences'

const MONO_FONT_FAMILY =
  'var(--modbus-slave-mono-font, "Iosevka", "Cascadia Mono", "Consolas", monospace)'
const MONO_FONT_SIZE = 'var(--modbus-slave-mono-font-size, 13px)'
const OVERSCAN = 12
const WINDOW_TITLEBAR_PADDING_TOP = 'calc(env(titlebar-area-height, 0px) + 10px)'

interface LogRow {
  id: number
  timestamp: number
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  module: string
  message: string
  line: string
  sizeBytes: number
}

const sanitizeSingleLine = (value: string): string =>
  value.replace(/\r?\n/g, ' ↩ ').replace(/\t/g, '  ')

const buildFilteredIndices = (rows: LogRow[], query: string): number[] => {
  const normalized = query.trim().toLowerCase()
  const next: number[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!normalized) {
      next.push(i)
      continue
    }
    const haystack =
      `${row.level} ${row.source} ${row.module} ${row.message} ${row.line}`.toLowerCase()
    if (haystack.includes(normalized)) next.push(i)
  }
  return next
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

const toRow = (entry: SystemLogEntry): LogRow => {
  const timestamp = new Date(entry.timestamp).toISOString().split('T')[1].slice(0, 12)
  const details =
    entry.details === undefined
      ? ''
      : typeof entry.details === 'string'
        ? sanitizeSingleLine(entry.details)
        : JSON.stringify(entry.details)
  const message = sanitizeSingleLine(entry.message)
  const line = `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.source}/${entry.module} | ${message}${details ? ` | ${details}` : ''}`
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level,
    source: entry.source,
    module: entry.module,
    message,
    line,
    sizeBytes: 96 + line.length * 2
  }
}

const SystemLogWindow = (): JSX.Element => {
  const { t } = useTranslation()
  const { alwaysOnTop, setWindowAlwaysOnTop } = useWindowAlwaysOnTop()
  const [monoFontSize, setMonoFontSize] = useState<number>(getGlobalMonoFontSizePreference)
  const [renderBufferLimitMb, setRenderBufferLimitMb] = useState<number>(
    getGlobalSystemLogBufferSizePreference
  )
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filterInput, setFilterInput] = useState('')
  const [renderVersion, setRenderVersion] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(400)
  const [viewportWidth, setViewportWidth] = useState(800)
  const [stats, setStats] = useState<SystemLogStats | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<LogRow[]>([])
  const filteredIndicesRef = useRef<number[]>([])
  const bufferBytesRef = useRef(0)
  const pendingRef = useRef<SystemLogEntry[]>([])
  const filterInputRef = useRef('')
  const renderBufferLimitBytesRef = useRef(renderBufferLimitMb * 1024 * 1024)
  const maxLineCharsRef = useRef(0)
  const lineHeight = useMemo(() => Math.max(24, monoFontSize + 10), [monoFontSize])

  const trimToLimit = useCallback(() => {
    while (
      bufferBytesRef.current > renderBufferLimitBytesRef.current &&
      rowsRef.current.length > 0
    ) {
      const first = rowsRef.current.shift()
      if (!first) break
      bufferBytesRef.current -= first.sizeBytes
    }
  }, [])

  const rebuildFiltered = useCallback(() => {
    filteredIndicesRef.current = buildFilteredIndices(rowsRef.current, filterInputRef.current)
  }, [])

  useEffect(() => {
    window.api
      .getSystemLogs(10000)
      .then((logs) => {
        if (!Array.isArray(logs) || logs.length === 0) return
        const mapped = logs.map(toRow)
        rowsRef.current = mapped
        maxLineCharsRef.current = mapped.reduce((max, row) => Math.max(max, row.line.length), 0)
        bufferBytesRef.current = mapped.reduce((sum, row) => sum + row.sizeBytes, 0)
        trimToLimit()
        filteredIndicesRef.current = buildFilteredIndices(rowsRef.current, filterInputRef.current)
        setRenderVersion((v) => v + 1)
      })
      .catch(() => undefined)
  }, [trimToLimit])

  useEffect(() => {
    const unlistenEntry = onEvent('system_log_entry', (entry) => {
      if (paused) return
      pendingRef.current.push(entry)
    })
    const unlistenClear = onEvent('system_log_clear', () => {
      rowsRef.current = []
      filteredIndicesRef.current = []
      pendingRef.current = []
      bufferBytesRef.current = 0
      maxLineCharsRef.current = 0
      setRenderVersion((v) => v + 1)
    })
    return () => {
      unlistenEntry()
      unlistenClear()
    }
  }, [paused])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (pendingRef.current.length === 0) return
      const next = pendingRef.current.splice(0, pendingRef.current.length).map(toRow)
      rowsRef.current.push(...next)
      for (const row of next) {
        maxLineCharsRef.current = Math.max(maxLineCharsRef.current, row.line.length)
      }
      bufferBytesRef.current += next.reduce((sum, row) => sum + row.sizeBytes, 0)
      trimToLimit()
      rebuildFiltered()
      setRenderVersion((v) => v + 1)
    }, 50)
    return () => window.clearInterval(timer)
  }, [rebuildFiltered, trimToLimit])

  useEffect(() => {
    filterInputRef.current = filterInput
    rebuildFiltered()
    setRenderVersion((v) => v + 1)
  }, [filterInput, rebuildFiltered])

  useEffect(() => {
    const timer = window.setInterval(() => {
      window.api
        .getSystemLogStats()
        .then(setStats)
        .catch(() => undefined)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const syncFromGlobal = (): void => {
      setMonoFontSize(getGlobalMonoFontSizePreference())
      setRenderBufferLimitMb(getGlobalSystemLogBufferSizePreference())
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key === GLOBAL_MONO_FONT_SIZE_KEY || event.key === GLOBAL_SYSTEM_LOG_BUFFER_MB_KEY)
        syncFromGlobal()
    }
    const onPreferenceChange = (event: Event): void => {
      const customEvent = event as CustomEvent<GlobalPreferenceChangeDetail>
      if (
        customEvent.detail?.key === GLOBAL_MONO_FONT_SIZE_KEY ||
        customEvent.detail?.key === GLOBAL_SYSTEM_LOG_BUFFER_MB_KEY
      ) {
        syncFromGlobal()
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(GLOBAL_PREFERENCE_CHANGE_EVENT, onPreferenceChange as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(
        GLOBAL_PREFERENCE_CHANGE_EVENT,
        onPreferenceChange as EventListener
      )
    }
  }, [])

  useEffect(() => {
    renderBufferLimitBytesRef.current = renderBufferLimitMb * 1024 * 1024
    trimToLimit()
    rebuildFiltered()
    setRenderVersion((v) => v + 1)
  }, [renderBufferLimitMb, rebuildFiltered, trimToLimit])

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

  const totalRows = filteredIndicesRef.current.length
  const startIndex = Math.max(0, Math.floor(scrollTop / lineHeight) - OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight / lineHeight) + OVERSCAN * 2
  const endIndex = Math.min(totalRows, startIndex + visibleCount)
  const visibleRows = useMemo(() => {
    const rows: Array<{ offset: number; row: LogRow }> = []
    for (let i = startIndex; i < endIndex; i++) {
      const row = rowsRef.current[filteredIndicesRef.current[i]]
      if (row) rows.push({ offset: i * lineHeight, row })
    }
    return rows
  }, [startIndex, endIndex, renderVersion, lineHeight])

  const handleClear = useCallback(() => {
    rowsRef.current = []
    filteredIndicesRef.current = []
    pendingRef.current = []
    bufferBytesRef.current = 0
    setRenderVersion((v) => v + 1)
    window.api.clearSystemLogs()
  }, [])

  const handleSave = useCallback(() => {
    const lines = filteredIndicesRef.current
      .map((idx) => rowsRef.current[idx]?.line)
      .filter((line): line is string => Boolean(line))
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `system-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const renderedSummary = `${totalRows} / ${rowsRef.current.length}`
  const bufferSummary = stats
    ? `${formatBytes(stats.bufferBytes)} / ${formatBytes(stats.bufferLimitBytes)}`
    : `${formatBytes(bufferBytesRef.current)} / ${formatBytes(renderBufferLimitBytesRef.current)}`
  const contentWidth = Math.max(
    viewportWidth,
    Math.ceil(maxLineCharsRef.current * monoFontSize * 0.62) + 24
  )

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
        <Box sx={{ px: 1, py: 0.6, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Toolbar variant="dense" disableGutters sx={{ minHeight: 34, gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ fontSize: '1rem', mr: 0.5 }}>
              System Logs
            </Typography>
            <Chip label={`Rows: ${renderedSummary}`} size="small" />
            <Chip label={`Buffer: ${bufferSummary}`} size="small" />
            <Chip
              label={`Errors: ${stats?.byLevel.error ?? 0}`}
              size="small"
              color="error"
              variant="outlined"
            />
            <Box sx={{ flex: 1 }} />
            <FormControlLabel
              sx={{ m: 0, mr: 0.5, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
              control={
                <Checkbox
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  size="small"
                />
              }
              label={t('common.autoScroll')}
            />
            <FormControlLabel
              sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
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
          <Toolbar variant="dense" disableGutters sx={{ minHeight: 38, gap: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              placeholder="Filter (level/source/module/message)"
              sx={{ flex: '1 1 500px', minWidth: 320, maxWidth: 820 }}
            />
            <Button
              variant={paused ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setPaused(false)}
              disabled={!paused}
            >
              {t('common.continue')}
            </Button>
            <Button
              variant={paused ? 'outlined' : 'contained'}
              size="small"
              onClick={() => setPaused(true)}
              disabled={paused}
            >
              {t('common.stop')}
            </Button>
            <Button variant="outlined" size="small" onClick={handleClear}>
              {t('common.clear')}
            </Button>
            <Button variant="outlined" size="small" onClick={handleSave} disabled={totalRows === 0}>
              {t('common.save')}
            </Button>
          </Toolbar>
        </Box>
      </AppBar>

      <Box
        ref={containerRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        sx={{
          flex: 1,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#111417' : '#f7f9fc'),
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
            No system logs.
          </Typography>
        ) : (
          <Box sx={{ position: 'relative', height: totalRows * lineHeight, width: contentWidth }}>
            {visibleRows.map(({ offset, row }) => (
              <Box
                key={`${row.id}-${row.timestamp}`}
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
                  bgcolor:
                    row.level === 'error'
                      ? 'rgba(244,67,54,0.15)'
                      : row.level === 'warn'
                        ? 'rgba(255,152,0,0.12)'
                        : theme.palette.mode === 'dark'
                          ? 'rgba(158,158,158,0.08)'
                          : 'rgba(158,158,158,0.04)',
                  color:
                    row.level === 'error'
                      ? 'error.main'
                      : row.level === 'warn'
                        ? 'warning.main'
                        : 'text.primary',
                  borderBottom: '1px solid rgba(255,255,255,0.02)'
                })}
              >
                {row.line}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default SystemLogWindow
