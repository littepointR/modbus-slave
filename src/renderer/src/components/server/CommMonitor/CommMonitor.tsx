import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Typography,
  Chip,
  Toolbar,
  Tooltip
} from '@mui/material'
import { PlayArrow, Stop, Clear, Save, FilterList } from '@mui/icons-material'
import type { ServerCommPacket, PacketStats } from '@shared'

interface CommMonitorProps {
  serverUuid: string
}

const functionCodeColors: Record<number, string> = {
  0x01: '#f44336',
  0x02: '#e91e63',
  0x03: '#2196f3',
  0x04: '#00bcd4',
  0x05: '#4caf50',
  0x06: '#8bc34a',
  0x0f: '#ff9800',
  0x10: '#ff5722'
}

const functionCodeNames: Record<number, string> = {
  0x01: 'Read Coils',
  0x02: 'Read Discrete Inputs',
  0x03: 'Read Holding Registers',
  0x04: 'Read Input Registers',
  0x05: 'Write Single Coil',
  0x06: 'Write Single Register',
  0x0f: 'Write Multiple Coils',
  0x10: 'Write Multiple Registers'
}

export const CommMonitor = ({ serverUuid }: CommMonitorProps): JSX.Element => {
  const [packets, setPackets] = useState<ServerCommPacket[]>([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [stats, setStats] = useState<PacketStats | null>(null)
  const packetsRef = useRef<ServerCommPacket[]>([])

  useEffect(() => {
    const unsubscribe = window.api.onCommPacket((packet) => {
      packetsRef.current = [...packetsRef.current, packet].slice(-1000)
      setPackets(packetsRef.current)
    })

    const unsubscribeClear = window.api.onCommMonitorClear(() => {
      packetsRef.current = []
      setPackets([])
    })

    return () => {
      unsubscribe()
      unsubscribeClear()
    }
  }, [])

  const handleStart = useCallback(async () => {
    await window.api.startCommMonitor()
    setIsMonitoring(true)
  }, [])

  const handleStop = useCallback(async () => {
    await window.api.stopCommMonitor()
    setIsMonitoring(false)
  }, [])

  const handleClear = useCallback(async () => {
    await window.api.clearCommMonitor()
    packetsRef.current = []
    setPackets([])
  }, [])

  const handleExport = useCallback(async () => {
    const filepath = await window.electron.showSaveDialog({
      defaultPath: 'modbus-log.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (filepath) {
      await window.api.exportCommLog(filepath)
    }
  }, [])

  const handleGetStats = useCallback(async () => {
    const s = await window.api.getCommStats()
    setStats(s)
  }, [])

  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts)
    return date.toLocaleTimeString() + '.' + date.getMilliseconds().toString().padStart(3, '0')
  }

  const formatData = (data: Uint8Array): string => {
    return Array.from(data)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ')
  }

  return (
    <Box
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      data-testid="comm-monitor"
    >
      <Toolbar variant="dense" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
          通信监视
        </Typography>

        {stats && (
          <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
            <Chip size="small" label={`RX: ${stats.rxCount}`} color="primary" />
            <Chip size="small" label={`TX: ${stats.txCount}`} color="secondary" />
            <Chip size="small" label={`Errors: ${stats.exceptionCount}`} color="error" />
          </Box>
        )}

        <Tooltip title={isMonitoring ? '停止监视' : '开始监视'}>
          <IconButton
            onClick={isMonitoring ? handleStop : handleStart}
            color={isMonitoring ? 'error' : 'success'}
          >
            {isMonitoring ? <Stop /> : <PlayArrow />}
          </IconButton>
        </Tooltip>

        <Tooltip title="清除">
          <IconButton onClick={handleClear}>
            <Clear />
          </IconButton>
        </Tooltip>

        <Tooltip title="导出">
          <IconButton onClick={handleExport}>
            <Save />
          </IconButton>
        </Tooltip>

        <Tooltip title="统计">
          <IconButton onClick={handleGetStats}>
            <FilterList />
          </IconButton>
        </Tooltip>
      </Toolbar>

      <TableContainer component={Paper} sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>序号</TableCell>
              <TableCell>时间</TableCell>
              <TableCell>方向</TableCell>
              <TableCell>从站</TableCell>
              <TableCell>功能码</TableCell>
              <TableCell>数据 (Hex)</TableCell>
              <TableCell>解析</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {packets.map((packet) => (
              <TableRow
                key={packet.id}
                sx={{
                  backgroundColor: packet.direction === 'TX' ? 'rgba(244, 67, 54, 0.05)' : 'inherit'
                }}
              >
                <TableCell>{packet.id}</TableCell>
                <TableCell>{formatTimestamp(packet.timestamp)}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={packet.direction}
                    color={packet.direction === 'RX' ? 'primary' : 'secondary'}
                  />
                </TableCell>
                <TableCell>{packet.slaveId}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={
                      functionCodeNames[packet.functionCode] ||
                      `0x${packet.functionCode.toString(16).padStart(2, '0')}`
                    }
                    sx={{
                      backgroundColor: functionCodeColors[packet.functionCode] || '#757575',
                      color: 'white'
                    }}
                  />
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {formatData(packet.data)}
                </TableCell>
                <TableCell>
                  {packet.parsed.exception && (
                    <Chip size="small" label={`异常: ${packet.parsed.exception}`} color="error" />
                  )}
                  {packet.parsed.values && (
                    <Typography variant="caption">
                      值: {packet.parsed.values.slice(0, 3).join(', ')}
                      {packet.parsed.values.length > 3 && '...'}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default CommMonitor
