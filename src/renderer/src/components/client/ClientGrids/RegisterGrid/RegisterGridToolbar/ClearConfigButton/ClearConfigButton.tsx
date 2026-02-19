import { Delete } from '@mui/icons-material'
import IconButton from '@mui/material/IconButton'

import { useRootZustand } from '@renderer/context/root.zustand'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

const ClearConfigButton = (): JSX.Element => {
  const [warn, setWarn] = useState(false)
  const { t } = useTranslation()

  const handleClick = useCallback(() => {
    useRootZustand.getState().setName('')
    useRootZustand.getState().clearRegisterMapping()
    useRootZustand.getState().setReadConfiguration(false)
  }, [])

  return (
    <IconButton
      data-testid="clear-config-btn"
      aria-label={t('client.config.clear')}
      size="small"
      onClick={handleClick}
      color={warn ? 'error' : 'primary'}
      title={t('client.config.clearTooltip')}
      onMouseEnter={() => setWarn(true)}
      onMouseLeave={() => setWarn(false)}
    >
      <Delete fontSize="small" />
    </IconButton>
  )
}

export default ClearConfigButton
