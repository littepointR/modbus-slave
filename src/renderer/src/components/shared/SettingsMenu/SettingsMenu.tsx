import { Settings as SettingsIcon } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import LanguageSwitcher from '../LanguageSwitcher'
import { useTranslation } from 'react-i18next'
import { useRef, useState } from 'react'

const SettingsMenu = () => {
  const { t } = useTranslation()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const open = !!anchor

  return (
    <Box>
      <Button
        data-testid="settings-btn"
        aria-label={t('common.settings')}
        title={t('common.settings')}
        ref={buttonRef}
        size="small"
        variant="outlined"
        onClick={() => setAnchor(buttonRef.current)}
        sx={{ minWidth: 38, maxWidth: 38, height: 36, borderColor: 'rgba(255, 255, 255, 0.23)' }}
      >
        <SettingsIcon />
      </Button>
      <Popover
        sx={{ mt: 1 }}
        slotProps={{ paper: { sx: { px: 2, py: 2, minWidth: 200 } } }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
      >
        <LanguageSwitcher />
      </Popover>
    </Box>
  )
}

export default SettingsMenu
