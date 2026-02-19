import { Box, Typography, Chip, Divider, Tooltip } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useServerZustand } from '@renderer/context/server.zustand'
import { CheckCircle as CheckCircleIcon, TrendingUp as TrendingUpIcon } from '@mui/icons-material'

interface ServerStatusBarProps {
  serverUuid: string
}

export const ServerStatusBar = meme(({ serverUuid }: ServerStatusBarProps): JSX.Element => {
  const port = useServerZustand((z) => z.port[serverUuid])
  const serverRegs = useServerZustand((z) => z.serverRegisters[serverUuid])

  const unitIds = Object.keys(serverRegs || {}).filter(
    (uid) =>
      serverRegs?.[uid] &&
      (Object.keys(serverRegs[uid].coils).length > 0 ||
        Object.keys(serverRegs[uid].discrete_inputs).length > 0 ||
        serverRegs[uid].holding_registers.length > 0 ||
        serverRegs[uid].input_registers.length > 0)
  )

  const totalRegisters = unitIds.reduce((sum, unitId) => {
    const regs = serverRegs?.[unitId]
    if (!regs) return sum
    return sum + regs.holding_registers.length + regs.input_registers.length
  }, 0)

  const totalBools = unitIds.reduce((sum, unitId) => {
    const regs = serverRegs?.[unitId]
    if (!regs) return sum
    return sum + Object.keys(regs.coils).length + Object.keys(regs.discrete_inputs).length
  }, 0)

  return (
    <Box
      sx={{
        height: 36,
        display: 'flex',
        alignItems: 'center',
        px: 2,
        gap: 2,
        backgroundColor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        overflow: 'hidden'
      }}
    >
      <Tooltip title="Server Status">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CheckCircleIcon color="success" fontSize="small" />
          <Typography variant="caption" color="success.main">
            运行中
          </Typography>
        </Box>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Chip
        size="small"
        label="ModbusTcp"
        variant="outlined"
        sx={{ height: 22, fontSize: '0.7rem' }}
      />

      <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 150 }}>
        0.0.0.0:{port || '502'}
      </Typography>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TrendingUpIcon fontSize="small" color="action" />
        <Typography variant="caption" color="text.secondary">
          {unitIds.length} 从站
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {totalRegisters} 寄存器
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {totalBools} 线圈
        </Typography>
      </Box>
    </Box>
  )
})

export default ServerStatusBar
