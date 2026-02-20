import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Typography,
  Button,
  FormControlLabel,
  Checkbox,
  AppBar,
  Toolbar,
  IconButton
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'
import type { ServerCommPacket } from '@shared'

const CommLogWindow = (): JSX.Element => {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<string[]>([])
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleCommPacket = (_: unknown, packet: ServerCommPacket) => {
      if (paused) return

      const timestamp = new Date(packet.timestamp).toISOString().split('T')[1].slice(0, 12)
      const direction = packet.direction
      const slaveId = packet.slaveId?.toString().padStart(3, '0') || '---'
      const dataStr = Array.from(packet.data)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ')

      const logLine = `[${timestamp}] ${direction} | Unit:${slaveId} | ${dataStr}`

      setLogs((prev) => {
        const newLogs = [...prev, logLine]
        return newLogs.slice(-1000)
      })
    }

    const handleClear = () => {
      setLogs([])
    }

    window.electron.ipcRenderer.on('comm_packet', handleCommPacket)
    window.electron.ipcRenderer.on('comm_monitor_clear', handleClear)

    return () => {
      window.electron.ipcRenderer.removeAllListeners('comm_packet')
      window.electron.ipcRenderer.removeAllListeners('comm_monitor_clear')
    }
  }, [paused])

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleClear = useCallback(() => {
    setLogs([])
    window.api.clearCommMonitor()
  }, [])

  const handleSave = useCallback(() => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comm-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [logs])

  const handleClose = useCallback(() => {
    window.close()
  }, [])

  return (
    <Box
      sx={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default'
      }}
    >
      <AppBar
        position="static"
        elevation={0}
        sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ flexGrow: 1, fontSize: '1rem' }}>
            {t('server.toolbar.commDetails')}
          </Typography>
          <Button
            variant={paused ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setPaused(false)}
            disabled={!paused}
            sx={{ mr: 1 }}
          >
            {t('common.continue')}
          </Button>
          <Button
            variant={paused ? 'outlined' : 'contained'}
            size="small"
            onClick={() => setPaused(true)}
            disabled={paused}
            sx={{ mr: 1 }}
          >
            {t('common.stop')}
          </Button>
          <Button variant="outlined" size="small" onClick={handleClear} sx={{ mr: 1 }}>
            {t('common.clear')}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleSave}
            disabled={logs.length === 0}
            sx={{ mr: 1 }}
          >
            {t('common.save')}
          </Button>
          <FormControlLabel
            control={
              <Checkbox
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                size="small"
              />
            }
            label={t('common.autoScroll')}
            sx={{ mr: 2 }}
          />
          <IconButton onClick={handleClose} size="small" edge="end">
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        ref={logRef}
        sx={{
          flex: 1,
          p: 1,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#11161d' : '#f7fbff'),
          color: 'text.primary',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}
      >
        {logs.length === 0 ? (
          <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {t('transaction.noData')}
          </Typography>
        ) : (
          logs.map((log, idx) => (
            <Box
              key={idx}
              sx={{
                mb: 0.5,
                px: 0.5,
                borderRadius: 0.5,
                bgcolor: (theme) =>
                  idx % 2 === 1
                    ? theme.palette.mode === 'dark'
                      ? 'rgba(255,255,255,0.04)'
                      : 'rgba(0,0,0,0.03)'
                    : 'transparent'
              }}
            >
              {log}
            </Box>
          ))
        )}
      </Box>
    </Box>
  )
}

export default CommLogWindow
