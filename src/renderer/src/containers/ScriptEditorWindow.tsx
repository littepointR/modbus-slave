import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayArrowIcon
} from '@mui/icons-material'
import Editor from '@monaco-editor/react'
import loader from '@monaco-editor/loader'
import * as monaco from 'monaco-editor'
import { v4 as uuidv4 } from 'uuid'
import { onEvent, sendEvent } from '@renderer/events'
import type { ScriptDefinitionPayload, ScriptEditorWindowInit } from '@shared'
import { useTranslation } from 'react-i18next'
import {
  GLOBAL_MONO_FONT_KEY,
  GLOBAL_MONO_FONT_SIZE_KEY,
  GLOBAL_PREFERENCE_CHANGE_EVENT,
  type GlobalPreferenceChangeDetail,
  getGlobalMonoFontFamily,
  getGlobalMonoFontPreference,
  getGlobalMonoFontSizePreference
} from '@renderer/settings/global-preferences'
import { useWindowAlwaysOnTop } from '@renderer/hooks/useWindowAlwaysOnTop'

loader.config({ monaco })
const WINDOW_TITLEBAR_PADDING_TOP = 'calc(env(titlebar-area-height, 0px) + 10px)'

const DEFAULT_SCRIPT_TEMPLATE = `// event.type: 'interval' | 'manual'
// api.getValue(unitId, registerType, address)
// api.setValue(unitId, registerType, address, value)
// registerType: '01' | '02' | '03' | '04'

const value = api.getValue(1, '03', 0)
if (typeof value === 'number') {
  await api.setValue(1, '03', 1, value)
}
`

const createDefaultScript = (index: number): ScriptDefinitionPayload => ({
  id: uuidv4(),
  name: `Script ${index}`,
  enabled: false,
  intervalMs: 1000,
  code: DEFAULT_SCRIPT_TEMPLATE
})

const ScriptEditorWindow = (): JSX.Element => {
  const { t } = useTranslation()
  const theme = useTheme()
  const { alwaysOnTop, setWindowAlwaysOnTop } = useWindowAlwaysOnTop()
  const [monoFontFamily, setMonoFontFamily] = useState<string>(() =>
    getGlobalMonoFontFamily(getGlobalMonoFontPreference())
  )
  const [monoFontSize, setMonoFontSize] = useState<number>(getGlobalMonoFontSizePreference)
  const [connectionId, setConnectionId] = useState<string>('')
  const [connectionAlias, setConnectionAlias] = useState<string>('Connection')
  const [scripts, setScripts] = useState<ScriptDefinitionPayload[]>([])
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null)

  const selectedScript = useMemo(
    () => scripts.find((script) => script.id === selectedScriptId) ?? null,
    [scripts, selectedScriptId]
  )

  const applyScripts = (nextScripts: ScriptDefinitionPayload[]): void => {
    setScripts(nextScripts)
    if (!connectionId) return
    sendEvent('script_editor_apply', { connectionId, scripts: nextScripts })
  }

  const updateScript = (scriptId: string, updates: Partial<ScriptDefinitionPayload>): void => {
    applyScripts(
      scripts.map((script) => (script.id === scriptId ? { ...script, ...updates } : script))
    )
  }

  const addScript = (): void => {
    const script = createDefaultScript(scripts.length + 1)
    const next = [...scripts, script]
    applyScripts(next)
    setSelectedScriptId(script.id)
  }

  const removeScript = (scriptId: string): void => {
    const next = scripts.filter((script) => script.id !== scriptId)
    applyScripts(next)
    if (selectedScriptId === scriptId) {
      setSelectedScriptId(next[0]?.id ?? null)
    }
  }

  useEffect(() => {
    const unlistenInit = onEvent('script_editor_init', (payload: ScriptEditorWindowInit) => {
      setConnectionId(payload.connectionId)
      setConnectionAlias(payload.connectionAlias || 'Connection')
      setScripts(payload.scripts || [])
      const nextSelected = payload.scripts?.[0]?.id ?? null
      setSelectedScriptId(nextSelected)
    })

    return () => {
      unlistenInit()
    }
  }, [])

  useEffect(() => {
    const syncMonoStyle = (): void => {
      setMonoFontFamily(getGlobalMonoFontFamily(getGlobalMonoFontPreference()))
      setMonoFontSize(getGlobalMonoFontSizePreference())
    }

    const onStorage = (event: StorageEvent): void => {
      if (event.key === GLOBAL_MONO_FONT_KEY || event.key === GLOBAL_MONO_FONT_SIZE_KEY) {
        syncMonoStyle()
      }
    }

    const onPreferenceChange = (event: Event): void => {
      const customEvent = event as CustomEvent<GlobalPreferenceChangeDetail>
      if (
        customEvent.detail?.key === GLOBAL_MONO_FONT_KEY ||
        customEvent.detail?.key === GLOBAL_MONO_FONT_SIZE_KEY
      ) {
        syncMonoStyle()
      }
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(GLOBAL_PREFERENCE_CHANGE_EVENT, onPreferenceChange as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(
        GLOBAL_PREFERENCE_CHANGE_EVENT,
        onPreferenceChange as EventListener
      )
    }
  }, [])

  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1.5,
        pt: WINDOW_TITLEBAR_PADDING_TOP
      }}
    >
      <Paper variant="outlined" sx={{ px: 1.25, py: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {`Script Editor - ${connectionAlias}`}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <FormControlLabel
            sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
            control={
              <Switch
                size="small"
                checked={alwaysOnTop}
                onChange={(event) => setWindowAlwaysOnTop(event.target.checked)}
              />
            }
            label={t('common.alwaysOnTop')}
          />
        </Box>
        <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            {`Scripts: ${scripts.length}`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {selectedScript ? `Current: ${selectedScript.name}` : 'Current: None'}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button onClick={addScript} startIcon={<AddIcon />} size="small" variant="outlined">
            Add Script
          </Button>
        </Box>
      </Paper>
      <Box
        sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '340px 1fr', gap: 1.5 }}
      >
        <Paper
          variant="outlined"
          sx={{ p: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {`Scripts - ${connectionAlias}`}
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1, pr: 0.5 }}>
            {scripts.map((script) => (
              <Paper
                key={script.id}
                variant={selectedScriptId === script.id ? 'elevation' : 'outlined'}
                elevation={selectedScriptId === script.id ? 2 : 0}
                sx={{ p: 1, cursor: 'pointer' }}
                onClick={() => setSelectedScriptId(script.id)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField
                    size="small"
                    label="Name"
                    value={script.name}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => updateScript(script.id, { name: event.target.value })}
                    sx={{ flex: 1 }}
                  />
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeScript(script.id)
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box
                  sx={{
                    mt: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <FormControlLabel
                    sx={{ m: 0, pl: 0.5 }}
                    control={
                      <Switch
                        size="small"
                        checked={script.enabled}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          updateScript(script.id, {
                            enabled: event.target.checked,
                            lastError: event.target.checked ? undefined : script.lastError
                          })
                        }
                      />
                    }
                    label={script.enabled ? 'Enabled' : 'Disabled'}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Interval ms"
                    value={script.intervalMs}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      updateScript(script.id, {
                        intervalMs: Math.max(100, Number(event.target.value) || 1000)
                      })
                    }
                    sx={{ width: 120 }}
                    inputProps={{ min: 100, step: 100 }}
                  />
                </Box>
                {script.lastError ? (
                  <Typography variant="caption" color="error.main">
                    {script.lastError}
                  </Typography>
                ) : null}
              </Paper>
            ))}
          </Box>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 1.5, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {selectedScript ? (
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1
                }}
              >
                <Typography variant="subtitle2">{selectedScript.name}</Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PlayArrowIcon />}
                  onClick={() =>
                    sendEvent('script_editor_run_once', {
                      connectionId,
                      scriptId: selectedScript.id
                    })
                  }
                >
                  Run Once
                </Button>
              </Box>
              <Box sx={{ flex: 1, minHeight: 0, border: '1px solid', borderColor: 'divider' }}>
                <Editor
                  height="100%"
                  defaultLanguage="javascript"
                  language="javascript"
                  theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'vs'}
                  value={selectedScript.code}
                  onChange={(value) => updateScript(selectedScript.id, { code: value || '' })}
                  options={{
                    minimap: { enabled: true },
                    fontFamily: monoFontFamily,
                    fontSize: monoFontSize,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                API: `getValue`, `setValue`, `setValues`, `log`. Register types: `01/02/03/04`.
              </Typography>
            </>
          ) : (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.secondary">Select a script from the left list.</Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  )
}

export default ScriptEditorWindow
