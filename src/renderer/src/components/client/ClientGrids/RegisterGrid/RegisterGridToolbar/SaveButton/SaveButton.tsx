import { Save } from '@mui/icons-material'
import IconButton from '@mui/material/IconButton'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterMapConfig, RegisterType } from '@shared'
import { snakeCase } from 'lodash'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

const SaveButton = meme(() => {
  const saveRegisterConfig = useCallback(async () => {
    const z = useRootZustand.getState()
    const { registerMapping, name } = z

    const registerMappingKeys = Object.keys(registerMapping) as RegisterType[]
    registerMappingKeys.forEach((key) => {
      Object.keys(registerMapping[key]).forEach((register) => {
        if (registerMapping[key][register]?.dataType === 'none') {
          delete registerMapping[key][register]
        }
      })
    })

    // Get app version
    const modbuxVersion = await window.api.getAppVersion()

    const registerMapConfig: RegisterMapConfig = {
      version: 2,
      modbuxVersion,
      name,
      registerMapping
    }

    const registerMappingJson = JSON.stringify(registerMapConfig, null, 2)

    const element = document.createElement('a')
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(registerMappingJson)
    )

    const {
      connectionConfig: { unitId }
    } = useRootZustand.getState()

    const idText = `_id${unitId}`

    const filename = `modbux_client_${snakeCase(name)}${idText}.json`

    element.setAttribute('download', filename)

    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }, [])

  const { t } = useTranslation()

  return (
    <IconButton
      data-testid="save-config-btn"
      aria-label={t('client.config.save')}
      size="small"
      onClick={saveRegisterConfig}
      color="primary"
      title={t('client.config.saveTooltip')}
    >
      <Save fontSize="small" />
    </IconButton>
  )
})

export default SaveButton
