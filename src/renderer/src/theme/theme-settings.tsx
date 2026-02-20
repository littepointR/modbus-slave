import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react'
import { ThemeProvider } from '@mui/material/styles'
import {
  createAppTheme,
  type ThemeModePreference,
  type ThemePrimaryPreset
} from './index'

const THEME_MODE_KEY = 'modbux.theme.mode'
const THEME_COLOR_KEY = 'modbux.theme.color'

interface ThemeSettingsContextValue {
  themeMode: ThemeModePreference
  themeColor: ThemePrimaryPreset
  resolvedMode: 'light' | 'dark'
  setThemeMode: (mode: ThemeModePreference) => void
  setThemeColor: (color: ThemePrimaryPreset) => void
}

const ThemeSettingsContext = createContext<ThemeSettingsContextValue | null>(null)

const getInitialThemeMode = (): ThemeModePreference => {
  const saved = localStorage.getItem(THEME_MODE_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

const getInitialThemeColor = (): ThemePrimaryPreset => {
  const saved = localStorage.getItem(THEME_COLOR_KEY)
  if (
    saved === 'green' ||
    saved === 'blue' ||
    saved === 'orange' ||
    saved === 'rose' ||
    saved === 'teal' ||
    saved === 'indigo' ||
    saved === 'red' ||
    saved === 'amber'
  ) {
    return saved
  }
  return 'green'
}

const resolveThemeMode = (mode: ThemeModePreference): 'light' | 'dark' => {
  if (mode === 'light' || mode === 'dark') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const ThemeSettingsProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [themeMode, setThemeModeState] = useState<ThemeModePreference>(getInitialThemeMode)
  const [themeColor, setThemeColorState] = useState<ThemePrimaryPreset>(getInitialThemeColor)
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>(() =>
    resolveThemeMode(getInitialThemeMode())
  )

  const setThemeMode = useCallback((mode: ThemeModePreference) => {
    setThemeModeState(mode)
    localStorage.setItem(THEME_MODE_KEY, mode)
  }, [])

  const setThemeColor = useCallback((color: ThemePrimaryPreset) => {
    setThemeColorState(color)
    localStorage.setItem(THEME_COLOR_KEY, color)
  }, [])

  useEffect(() => {
    const nextMode = resolveThemeMode(themeMode)
    setResolvedMode(nextMode)

    if (themeMode !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolvedMode(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [themeMode])

  const muiTheme = useMemo(() => createAppTheme(resolvedMode, themeColor), [resolvedMode, themeColor])

  const value = useMemo<ThemeSettingsContextValue>(
    () => ({
      themeMode,
      themeColor,
      resolvedMode,
      setThemeMode,
      setThemeColor
    }),
    [themeMode, themeColor, resolvedMode, setThemeMode, setThemeColor]
  )

  return (
    <ThemeSettingsContext.Provider value={value}>
      <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>
    </ThemeSettingsContext.Provider>
  )
}

export const useThemeSettings = (): ThemeSettingsContextValue => {
  const context = useContext(ThemeSettingsContext)
  if (!context) {
    throw new Error('useThemeSettings must be used within ThemeSettingsProvider')
  }
  return context
}
