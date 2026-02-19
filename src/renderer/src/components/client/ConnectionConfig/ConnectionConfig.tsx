import {
  Box,
  Button,
  ButtonProps,
  CircularProgress,
  InputBaseComponentProps,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import RtuConfig from './RtuConfig/RtuConfig'
import TcpConfig from './TcpConfig/TcpConfig'
import { useRootZustand } from '@renderer/context/root.zustand'
import { Protocol } from '@shared'
import { ElementType, useCallback } from 'react'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import { useDataZustand } from '@renderer/context/data.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useTranslation } from 'react-i18next'

// Protocol
const ProtocolSelect = meme(({ protocol }: { protocol: Protocol }) => {
  const disabled = useRootZustand((z) => z.clientState.connectState !== 'disconnected')
  const setProtocol = useRootZustand((z) => z.setProtocol)

  return (
    <ToggleButtonGroup
      disabled={disabled}
      size="small"
      exclusive
      color="primary"
      value={protocol}
      onChange={(_, v) => v !== null && setProtocol(v)}
    >
      <ToggleButton value={'ModbusTcp'} data-testid="protocol-tcp-btn">
        TCP
      </ToggleButton>
      <ToggleButton value={'ModbusRtu'} data-testid="protocol-rtu-btn">
        RTU
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

const ConnectButton = meme(() => {
  const { t } = useTranslation()
  const connectState = useRootZustand((z) => z.clientState.connectState)
  const setRegisterData = useDataZustand((z) => z.setRegisterData)

  const action = useCallback(() => {
    const currentConnectedState = useRootZustand.getState().clientState.connectState
    if (['connecting', 'connected'].includes(currentConnectedState)) {
      window.api.disconnect()
      setRegisterData([])
      return
    }

    if (currentConnectedState === 'disconnected') {
      window.api.connect()
    }
  }, [setRegisterData])

  const disabled = ['disconnecting'].includes(connectState)

  const color: ButtonProps['color'] = ['connecting', 'connected'].includes(connectState)
    ? 'warning'
    : 'primary'

  const text =
    connectState === 'connected' ? (
      t('common.disconnect')
    ) : connectState === 'disconnected' ? (
      t('common.connect')
    ) : (
      <CircularProgress
        size={18}
        title={t('common.cancel')}
        sx={(theme) => ({
          color: theme.palette.warning.contrastText
        })}
      />
    )

  return (
    <Button
      sx={{ width: 100 }}
      disabled={disabled}
      onClick={action}
      color={color}
      data-testid="connect-btn"
    >
      {text}
    </Button>
  )
})

//
//
// Unit Id
const UnitId = meme(() => {
  const { t } = useTranslation()
  const unitId = useRootZustand((z) => String(z.connectionConfig.unitId))

  return (
    <TextField
      label={t('client.connection.unitId')}
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={unitId}
      data-testid="client-unitid-input"
      slotProps={{
        input: {
          inputComponent: UnitIdInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: useRootZustand.getState().setUnitId })
        }
      }}
    />
  )
})

const ConnectionConfig = meme(() => {
  const protocol = useRootZustand((z) => z.connectionConfig.protocol)
  return (
    <>
      {protocol === 'ModbusTcp' ? <TcpConfig /> : <RtuConfig />}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <ProtocolSelect protocol={protocol} />
        <UnitId />
        <ConnectButton />
      </Box>
    </>
  )
})

export default ConnectionConfig
