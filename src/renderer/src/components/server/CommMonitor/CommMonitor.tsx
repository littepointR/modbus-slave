import { useState, useCallback } from 'react'
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
import { PlayArrow, Stop, Clear, Save } from '@mui/icons-material'

interface CommMonitorProps {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  serverUuid: string
}

// Stub component - CommMonitor functionality requires IPC handlers that don't exist yet
export const CommMonitor = (_props: CommMonitorProps): JSX.Element => {
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [packets] = useState<
    Array<{ id: number; timestamp: string; direction: string; data: string }>
  >([])

  const handleStart = useCallback(() => {
    setIsMonitoring(true)
  }, [])

  const handleStop = useCallback(() => {
    setIsMonitoring(false)
  }, [])

  const handleClear = useCallback(() => {
    // Clear packets - stubbed
  }, [])

  const handleExport = useCallback(() => {
    // Export to CSV - stubbed
  }, [])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar variant="dense" sx={{ px: 1, gap: 1 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          Communication Monitor
        </Typography>
        {!isMonitoring ? (
          <Tooltip title="Start Monitoring">
            <IconButton
              aria-label="Start Monitoring"
              size="small"
              onClick={handleStart}
              color="success"
            >
              <PlayArrow />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Stop Monitoring">
            <IconButton
              aria-label="Stop Monitoring"
              size="small"
              onClick={handleStop}
              color="error"
            >
              <Stop />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Clear">
          <IconButton aria-label="Clear monitoring log" size="small" onClick={handleClear}>
            <Clear />
          </IconButton>
        </Tooltip>
        <Tooltip title="Export to CSV">
          <IconButton aria-label="Export to CSV" size="small" onClick={handleExport}>
            <Save />
          </IconButton>
        </Tooltip>
      </Toolbar>

      <TableContainer component={Paper} sx={{ flexGrow: 1, mx: 1, mb: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Direction</TableCell>
              <TableCell>Function</TableCell>
              <TableCell>Unit ID</TableCell>
              <TableCell>Data</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {packets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  {isMonitoring
                    ? 'Monitoring... No packets received yet.'
                    : 'Click Start to begin monitoring'}
                </TableCell>
              </TableRow>
            ) : (
              packets.map((packet) => (
                <TableRow key={packet.id}>
                  <TableCell>{packet.timestamp}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={packet.direction}
                      color={packet.direction === 'TX' ? 'primary' : 'success'}
                    />
                  </TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {packet.data}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default CommMonitor
