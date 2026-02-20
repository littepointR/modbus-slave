import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'

import './index.css'
import './i18n'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { CssBaseline, IconButton } from '@mui/material'
import { styled } from '@mui/material/styles'
import { closeSnackbar, SnackbarProvider, MaterialDesignContent } from 'notistack'
import { Close } from '@mui/icons-material'
import App from './App'
import { ThemeSettingsProvider } from './theme/theme-settings'

const StyledMaterialDesignContent = styled(MaterialDesignContent)(({ theme }) => ({
  '&.notistack-MuiContent-success': {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
    '& .MuiIconButton-root': { svg: { fill: theme.palette.success.contrastText } }
  },
  '&.notistack-MuiContent-error': {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
    '& .MuiIconButton-root': { svg: { fill: theme.palette.error.contrastText } }
  },
  '&.notistack-MuiContent-warning': {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
    '& .MuiIconButton-root': { svg: { fill: theme.palette.warning.contrastText } }
  },
  '&.notistack-MuiContent-info': {
    backgroundColor: theme.palette.info.main,
    color: theme.palette.info.contrastText,
    '& .MuiIconButton-root': { svg: { fill: theme.palette.info.contrastText } }
  },
  '&.notistack-MuiContent-default': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    '&.MuiIconButton-root': { svg: { fill: theme.palette.primary.contrastText } }
  }
}))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeSettingsProvider>
      <SnackbarProvider
        maxSnack={3}
        {...{
          preventDuplicate: true,
          autoHideDuration: 3000,
          Components: {
            error: StyledMaterialDesignContent,
            success: StyledMaterialDesignContent,
            warning: StyledMaterialDesignContent,
            info: StyledMaterialDesignContent,
            default: StyledMaterialDesignContent
          },
          action: (snackbarId) => (
            <IconButton onClick={() => closeSnackbar(snackbarId)}>
              <Close />
            </IconButton>
          )
        }}
      >
        <CssBaseline />
        <App />
      </SnackbarProvider>
    </ThemeSettingsProvider>
  </React.StrictMode>
)
