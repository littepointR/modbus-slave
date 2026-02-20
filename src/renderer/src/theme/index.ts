import { createTheme } from '@mui/material'

export type ThemeModePreference = 'light' | 'dark' | 'system'
export type ThemePrimaryPreset =
  | 'green'
  | 'blue'
  | 'orange'
  | 'rose'
  | 'teal'
  | 'indigo'
  | 'red'
  | 'amber'

interface ThemePreset {
  primary: string
  secondary: string
  success: string
}

const PRESETS: Record<ThemePrimaryPreset, ThemePreset> = {
  green: {
    primary: '#2e7d32',
    secondary: '#1b5e20',
    success: '#43a047'
  },
  blue: {
    primary: '#1976d2',
    secondary: '#0d47a1',
    success: '#2e7d32'
  },
  orange: {
    primary: '#ef6c00',
    secondary: '#e65100',
    success: '#2e7d32'
  },
  rose: {
    primary: '#c2185b',
    secondary: '#880e4f',
    success: '#2e7d32'
  },
  teal: {
    primary: '#00796b',
    secondary: '#004d40',
    success: '#2e7d32'
  },
  indigo: {
    primary: '#3949ab',
    secondary: '#1a237e',
    success: '#2e7d32'
  },
  red: {
    primary: '#d32f2f',
    secondary: '#8b1e1e',
    success: '#2e7d32'
  },
  amber: {
    primary: '#ff8f00',
    secondary: '#e65100',
    success: '#2e7d32'
  }
}

export const getThemePreset = (preset: ThemePrimaryPreset): ThemePreset => {
  return PRESETS[preset]
}

export const createAppTheme = (mode: 'light' | 'dark', preset: ThemePrimaryPreset) => {
  const colors = getThemePreset(preset)

  return createTheme({
    spacing: 8,
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 1200,
        lg: 1600,
        xl: 1920
      }
    },
    palette: {
      mode,
      background:
        mode === 'dark'
          ? {
              default: '#171a1f',
              paper: '#20252d'
            }
          : {
              default: '#f6f8fb',
              paper: '#ffffff'
            },
      primary: {
        main: colors.primary
      },
      secondary: {
        main: colors.secondary
      },
      warning: {
        main: '#f59e0b'
      },
      error: {
        main: '#d32f2f'
      },
      info: {
        main: mode === 'dark' ? '#90caf9' : '#1976d2'
      },
      success: {
        main: colors.success
      }
    },
    shape: {
      borderRadius: 4
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      button: {
        textTransform: 'none',
        fontWeight: 500
      },
      subtitle2: {
        fontWeight: 500
      }
    },
    components: {
      MuiPaper: {
        defaultProps: {
          elevation: 0
        },
        styleOverrides: {
          root: {
            borderRadius: 4
          }
        }
      },
      MuiAppBar: {
        defaultProps: {
          elevation: 0,
          color: 'default'
        }
      },
      MuiButton: {
        defaultProps: { variant: 'text', size: 'small' },
        styleOverrides: {
          root: {
            borderRadius: 4
          }
        }
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottomStyle: 'solid'
          },
          head: {
            fontWeight: 500
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          sizeSmall: {
            height: 20
          }
        }
      }
    }
  })
}
