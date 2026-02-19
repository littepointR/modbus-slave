import { Timer } from '@mui/icons-material'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Popover from '@mui/material/Popover'
import { meme } from '@renderer/components/shared/inputs/meme'
import SliderComponent from '@renderer/components/shared/SliderComponent'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Polling interval slider
const PollRate = (): JSX.Element => {
  const { t } = useTranslation()
  const value = useRootZustand((z) => Math.floor(z.registerConfig.pollRate / 1000))
  const setValue = useRootZustand((z) => z.setPollRate)

  return <SliderComponent label={t('common.pollRate')} value={value} setValue={(v) => setValue(v * 1000)} />
}

// Read Timeout slider
const Timeout = (): JSX.Element => {
  const { t } = useTranslation()
  const value = useRootZustand((z) => Math.floor(z.registerConfig.timeout / 1000))
  const setValue = useRootZustand((z) => z.setTimeout)

  return <SliderComponent label={t('common.timeout')} value={value} setValue={(v) => setValue(v * 1000)} />
}

const TimeSettings = meme(() => {
  const { t } = useTranslation()
  const polling = useRootZustand((z) => z.clientState.polling)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const handleOpenMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>): void => {
      setAnchorEl(anchorEl ? null : event.currentTarget)
    },
    [anchorEl]
  )
  return (
    <Box sx={{ display: 'flex' }}>
      <IconButton
        data-testid="time-settings-btn"
        aria-label={t('common.timeSettings')}
        title={t('common.timeSettings')}
        disabled={polling}
        size="small"
        color="primary"
        onClick={handleOpenMenu}
      >
        <Timer />
      </IconButton>
      <Popover
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorEl={anchorEl}
        disablePortal={false}
      >
        <Paper elevation={3} sx={{ p: 1 }}>
          <PollRate />
          <Timeout />
        </Paper>
      </Popover>
    </Box>
  )
})
export default TimeSettings
