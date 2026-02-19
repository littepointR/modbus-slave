import { Box, MenuItem, Select, SelectChangeEvent, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

const languages = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' }
]

const LanguageSwitcher = (): JSX.Element => {
  const { i18n, t } = useTranslation()

  const handleChange = (event: SelectChangeEvent<string>) => {
    const newLang = event.target.value
    i18n.changeLanguage(newLang)
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('common.language')}:
      </Typography>
      <Select
        value={i18n.language}
        onChange={handleChange}
        size="small"
        sx={{ minWidth: 120 }}
        renderValue={(value) => {
          const lang = languages.find((l) => l.code === value) || languages[0]
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </Box>
          )
        }}
      >
        {languages.map((lang) => (
          <MenuItem key={lang.code} value={lang.code}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </Box>
  )
}

export default LanguageSwitcher
