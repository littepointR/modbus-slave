import { Settings as SettingsIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import {
  Autocomplete,
  Box,
  Button,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  type SelectChangeEvent,
  Slider,
  TextField,
  Typography
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useThemeSettings } from '@renderer/theme/theme-settings'
import type { ThemeModePreference, ThemePrimaryPreset } from '@renderer/theme'
import LanguageSwitcher from '../LanguageSwitcher'
import {
  GLOBAL_MONO_FONT_CANDIDATES,
  GLOBAL_MONO_FONT_SIZE_KEY,
  GLOBAL_PREFERENCE_CHANGE_EVENT,
  GLOBAL_STRING_ENCODING_OPTIONS,
  type GlobalPreferenceChangeDetail,
  GLOBAL_MONO_FONT_FALLBACK,
  getGlobalMonoFontPreference,
  getGlobalMonoFontSizePreference,
  getGlobalStringEncodingPreference,
  setGlobalMonoFontPreference,
  setGlobalMonoFontSizePreference,
  setGlobalStringEncodingPreference
} from '@renderer/settings/global-preferences'

interface LocalFontFace {
  family: string
}

const SettingsMenu = () => {
  const { t } = useTranslation()
  const { themeMode, themeColor, setThemeMode, setThemeColor } = useThemeSettings()
  const [monoFont, setMonoFont] = useState<string>(getGlobalMonoFontPreference)
  const [monoFontSize, setMonoFontSize] = useState<number>(getGlobalMonoFontSizePreference)
  const [globalEncoding, setGlobalEncoding] = useState<string>(getGlobalStringEncodingPreference)
  const [localFontFamilies, setLocalFontFamilies] = useState<string[]>([])
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [colorPickerExpanded, setColorPickerExpanded] = useState(false)

  const open = !!anchor

  useEffect(() => {
    const queryLocalFonts = async (): Promise<void> => {
      try {
        const win = window as Window & {
          queryLocalFonts?: () => Promise<LocalFontFace[]>
        }
        if (typeof win.queryLocalFonts !== 'function') return
        const fonts = await win.queryLocalFonts()
        const families = [...new Set(fonts.map((font) => font.family).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b)
        )
        setLocalFontFamilies(families)
      } catch {
        setLocalFontFamilies([])
      }
    }

    void queryLocalFonts()
  }, [])

  useEffect(() => {
    const onPreferenceChange = (event: Event): void => {
      const customEvent = event as CustomEvent<GlobalPreferenceChangeDetail>
      if (customEvent.detail?.key === GLOBAL_MONO_FONT_SIZE_KEY) {
        setMonoFontSize(getGlobalMonoFontSizePreference())
      }
    }
    window.addEventListener(GLOBAL_PREFERENCE_CHANGE_EVENT, onPreferenceChange as EventListener)
    return () => {
      window.removeEventListener(GLOBAL_PREFERENCE_CHANGE_EVENT, onPreferenceChange as EventListener)
    }
  }, [])

  const handleThemeModeChange = (event: SelectChangeEvent<string>) => {
    setThemeMode(event.target.value as ThemeModePreference)
  }

  const handleThemeColorClick = (color: ThemePrimaryPreset) => setThemeColor(color)

  const handleFontSelect = (_: unknown, value: string | null): void => {
    const next = value?.trim() || getGlobalMonoFontPreference()
    setMonoFont(next)
    setGlobalMonoFontPreference(next)
  }

  const handleFontInputChange = (_: unknown, value: string): void => {
    setMonoFont(value)
  }

  const handleFontSizeSliderChange = (_: Event, value: number | number[]): void => {
    const next = Array.isArray(value) ? value[0] : value
    setMonoFontSize(next)
    setGlobalMonoFontSizePreference(next)
  }

  const handleFontSizeInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number.parseInt(event.target.value, 10)
    if (!Number.isFinite(next)) return
    setMonoFontSize(next)
    setGlobalMonoFontSizePreference(next)
  }

  const handleEncodingChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value
    setGlobalEncoding(value)
    setGlobalStringEncodingPreference(value)
  }

  const themeColorPresets: Array<{ value: ThemePrimaryPreset; label: string; color: string }> = [
    { value: 'green', label: t('common.themeColorGreen'), color: '#2e7d32' },
    { value: 'blue', label: t('common.themeColorBlue'), color: '#1976d2' },
    { value: 'orange', label: t('common.themeColorOrange'), color: '#ef6c00' },
    { value: 'rose', label: t('common.themeColorRose'), color: '#c2185b' },
    { value: 'teal', label: 'Teal', color: '#00796b' },
    { value: 'indigo', label: 'Indigo', color: '#3949ab' },
    { value: 'red', label: 'Red', color: '#d32f2f' },
    { value: 'amber', label: 'Amber', color: '#ff8f00' }
  ]

  const activeThemePreset = themeColorPresets.find((preset) => preset.value === themeColor)
  const monoFontOptions = useMemo(() => {
    return [...new Set([...GLOBAL_MONO_FONT_CANDIDATES, ...localFontFamilies])]
  }, [localFontFamilies])

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
        slotProps={{ paper: { sx: { px: 2, py: 2, minWidth: 300 } } }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        open={open}
        anchorEl={anchor}
        onClose={() => {
          setAnchor(null)
          setColorPickerExpanded(false)
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <LanguageSwitcher />
          <Typography variant="caption" color="text.secondary">
            {t('common.theme')}
          </Typography>
          <FormControl size="small" fullWidth>
            <InputLabel>{t('common.themeMode')}</InputLabel>
            <Select label={t('common.themeMode')} value={themeMode} onChange={handleThemeModeChange}>
              <MenuItem value="light">{t('common.themeModeLight')}</MenuItem>
              <MenuItem value="dark">{t('common.themeModeDark')}</MenuItem>
              <MenuItem value="system">{t('common.themeModeSystem')}</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.themeColor')}
            </Typography>
            <Box
              data-testid="theme-color-select"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1,
                py: 0.75,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor: activeThemePreset?.color || '#2e7d32',
                    border: '1px solid',
                    borderColor: alpha('#000', 0.25)
                  }}
                />
                <Typography variant="body2">{activeThemePreset?.label || 'Theme'}</Typography>
              </Box>
              <IconButton
                size="small"
                onClick={() => setColorPickerExpanded((prev) => !prev)}
                aria-label="toggle-theme-color-picker"
              >
                <ExpandMoreIcon
                  sx={{
                    transform: colorPickerExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 140ms ease'
                  }}
                />
              </IconButton>
            </Box>
            <Collapse in={colorPickerExpanded} timeout={120}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.75 }}>
                {themeColorPresets.map((preset) => {
                  const isActive = themeColor === preset.value
                  return (
                    <IconButton
                      key={preset.value}
                      size="small"
                      aria-label={preset.label}
                      onClick={() => handleThemeColorClick(preset.value)}
                      sx={{
                        width: 30,
                        height: 30,
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
            </Collapse>
          </Box>
          <Autocomplete
            size="small"
            freeSolo
            options={monoFontOptions}
            value={monoFont}
            onChange={handleFontSelect}
            onInputChange={handleFontInputChange}
            renderInput={(params) => <TextField {...params} label={t('common.globalFont')} />}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ fontFamily: `"${option}", ${GLOBAL_MONO_FONT_FALLBACK}` }}>
                {option}
              </Box>
            )}
          />
          <Box sx={{ px: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.globalFontSize')}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Slider
                value={monoFontSize}
                min={10}
                max={24}
                step={1}
                onChange={handleFontSizeSliderChange}
                valueLabelDisplay="auto"
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                type="number"
                value={monoFontSize}
                onChange={handleFontSizeInputChange}
                inputProps={{ min: 10, max: 24, step: 1 }}
                sx={{ width: 72 }}
              />
            </Box>
          </Box>
          <FormControl size="small" fullWidth>
            <InputLabel>{t('common.globalEncoding')}</InputLabel>
            <Select label={t('common.globalEncoding')} value={globalEncoding} onChange={handleEncodingChange}>
              {GLOBAL_STRING_ENCODING_OPTIONS.map((encoding) => (
                <MenuItem key={encoding} value={encoding}>
                  {encoding}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Popover>
    </Box>
  )
}

export default SettingsMenu
