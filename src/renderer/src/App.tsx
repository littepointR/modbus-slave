import { Box } from '@mui/material'
import Server from './containers/Server'
import CommLogWindow from './containers/CommLogWindow'
import RegisterPlotWindow from './containers/RegisterPlotWindow'
import UpdateBanner from './components/UpdateBanner'

const App = (): JSX.Element => {
  if (window.api.isRegisterPlotWindow) {
    return <RegisterPlotWindow />
  }

  if (window.api.isCommLogWindow) {
    return <CommLogWindow />
  }

  return (
    <Box
      sx={{
        height: '100dvh',
        width: '100dvw',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <UpdateBanner />
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Server />
      </Box>
    </Box>
  )
}

export default App
