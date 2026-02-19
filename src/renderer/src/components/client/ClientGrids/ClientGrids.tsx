import Box from '@mui/material/Box'
import TransactionGrid from '@renderer/components/client/ClientGrids/TransactionGrid/TransactionGrid'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useChartZustand } from '@renderer/components/client/Charts'
import RegisterGrid from './RegisterGrid/RegisterGrid'
import { ChartPanel, ChartConfigDialog } from '@renderer/components/client/Charts'

const ClientGrids = (): JSX.Element | null => {
  const showLog = useLayoutZustand((z) => z.showLog)
  const scanning = useRootZustand((z) => z.clientState.scanningRegisters)
  const chartEnabled = useChartZustand((z) => z.config.enabled)

  return scanning ? null : (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
        gap: 2
      }}
    >
      <RegisterGrid />
      {chartEnabled && <ChartPanel />}
      {showLog && <TransactionGrid />}
      <ChartConfigDialog />
    </Box>
  )
}

export default ClientGrids
