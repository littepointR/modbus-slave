import { FileOpen } from '@mui/icons-material'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { useRootZustand } from '@renderer/context/root.zustand'
import { migrateClientConfig } from '@shared'
import { useSnackbar } from 'notistack'
import { useRef, useState, useCallback } from 'react'
import { showMapping } from '../ViewConfigButton/ViewConfigButton'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useTranslation } from 'react-i18next'

const LoadButton = meme((): JSX.Element => {
  const openingRef = useRef(false)
  const [opening, setOpening] = useState(false)

  const { enqueueSnackbar } = useSnackbar()
  const { t } = useTranslation()

  const openConfig = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      if (openingRef.current) return
      openingRef.current = true
      setOpening(true)

      const state = useRootZustand.getState()

      const content = await file.text()

      try {
        // Use migration framework to handle all config versions
        const migrationResult = migrateClientConfig(content)
        const { config, migrated, warning } = migrationResult

        // Set name and register mapping
        if (config.name) state.setName(config.name)
        state.replaceRegisterMapping(config.registerMapping)

        // Show success notification with translation
        if (migrated) {
          enqueueSnackbar({
            variant: 'info',
            message: t('snackbar.configMigrated'),
            autoHideDuration: 5000
          })
        } else {
          enqueueSnackbar({
            variant: 'success',
            message: t('snackbar.configOpened')
          })
        }

        // Show warning for future version
        if (warning === 'FUTURE_VERSION') {
          enqueueSnackbar({
            variant: 'warning',
            message: t('snackbar.futureVersion'),
            persist: true
          })
        }
      } catch (error) {
        const tError = error as Error
        enqueueSnackbar({ variant: 'error', message: t('snackbar.invalidJson', { message: tError.message }) })
        console.error('Config load error:', error)
      }

      openingRef.current = false
      setOpening(false)
      showMapping()
      useRootZustand.getState().setReadConfiguration(false)
    },
    [enqueueSnackbar, t]
  )

  return (
    <Box>
      {!opening && (
        <input
          data-testid="load-config-file-input"
          accept="application/JSON"
          style={{ display: 'none' }}
          id="contained-button-file"
          type="file"
          onChange={(e) => openConfig(e.target.files?.[0])}
        />
      )}
      <label htmlFor="contained-button-file">
        <IconButton
          data-testid="load-config-btn"
          aria-label={t('client.config.load')}
          size="small"
          disabled={opening}
          color="primary"
          component="span"
          title={t('client.config.loadTooltip')}
        >
          <FileOpen fontSize="small" />
        </IconButton>
      </label>
    </Box>
  )
})

export default LoadButton
