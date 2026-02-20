import { Settings as SettingsIcon } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import IconButton from '@mui/material/IconButton'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import LanguageSwitcher from '../LanguageSwitcher'
import { useTranslation } from 'react-i18next'
import { useRef, useState } from 'react'
import { useThemeSettings } from '@renderer/theme/theme-settings'
import type { ThemeModePreference, ThemePrimaryPreset } from '@renderer/theme'
import { alpha } from '@mui/material/styles'

const SettingsMenu = () => {
  const { t } = useTranslation()
  const { themeMode, themeColor, setThemeMode, setThemeColor } = useThemeSettings()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const open = !!anchor

  const handleThemeModeChange = (event: SelectChangeEvent<string>) => {
    setThemeMode(event.target.value as ThemeModePreference)
  }

  const handleThemeColorClick = (color: ThemePrimaryPreset) => setThemeColor(color)

  const themeColorPresets: Array<{ value: ThemePrimaryPreset; label: string; color: string }> = [
    { value: 'green', label: t('common.themeColorGreen'), color: '#2e7d32' },
    { value: 'blue', label: t('common.themeColorBlue'), color: '#1976d2' },
    { value: 'orange', label: t('common.themeColorOrange'), color: '#ef6c00' },
    { value: 'rose', label: t('common.themeColorRose'), color: '#c2185b' }
  ]

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
        sx={{ minWidth: 38, maxWidth: 38, height: 36, borderColor: 'divider' }}
      >
        <SettingsIcon />
      </Button>
      <Popover
        sx={{ mt: 1 }}
        slotProps={{ paper: { sx: { px: 2, py: 2, minWidth: 260 } } }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <LanguageSwitcher />
          <Typography variant="caption" color="text.secondary">
            {t('common.theme')}
          </Typography>
          <FormControl size="small" fullWidth>
            <InputLabel>{t('common.themeMode')}</InputLabel>
            <Select
              label={t('common.themeMode')}
              value={themeMode}
              onChange={handleThemeModeChange}
              SelectDisplayProps={{ 'data-testid': 'theme-mode-select' }}
            >
              <MenuItem value="light">{t('common.themeModeLight')}</MenuItem>
              <MenuItem value="dark">{t('common.themeModeDark')}</MenuItem>
              <MenuItem value="system">{t('common.themeModeSystem')}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>{t('common.themeColor')}</InputLabel>
            <Box
              data-testid="theme-color-select"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1,
                py: 1,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1
              }}
            >
              {themeColorPresets.map((preset) => {
                const isActive = themeColor === preset.value
                return (
                  <IconButton
                    key={preset.value}
                    size="small"
                    aria-label={preset.label}
                    onClick={() => handleThemeColorClick(preset.value)}
                    sx={{
                      width: 26,
                      height: 26,
                      bgcolor: preset.color,
                      border: '1px solid',
                      borderColor: isActive ? 'text.primary' : alpha('#000', 0.2),
                      boxShadow: isActive ? 2 : 0,
                      '&:hover': { bgcolor: preset.color }
                    }}
                  />
                )
              })}
            </Box>
          </FormControl>
        </Box>
      </Popover>
    </Box>
  )
}

export default SettingsMenu
