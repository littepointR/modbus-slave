import { TextField, Box, InputBaseComponentProps } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UintInput from '@renderer/components/shared/inputs/UintInput'
import { ElementType } from 'react'
import { useTranslation } from 'react-i18next'

interface TcpUdpConfigProps {
  host: string
  port: number
  onHostChange: (host: string) => void
  onPortChange: (port: number) => void
  disabled?: boolean
}

const HostField = meme(
  ({
    host,
    onHostChange,
    disabled
  }: Pick<TcpUdpConfigProps, 'host' | 'onHostChange' | 'disabled'>) => {
    const { t } = useTranslation()

    return (
      <TextField
        disabled={disabled}
        label={t('server.connection.host')}
        variant="outlined"
        size="small"
        sx={{ width: 130 }}
        value={host}
        data-testid="server-host-input"
        onChange={(e) => onHostChange(e.target.value)}
      />
    )
  }
)

const PortField = meme(
  ({
    port,
    onPortChange,
    disabled
  }: Pick<TcpUdpConfigProps, 'port' | 'onPortChange' | 'disabled'>) => {
    const { t } = useTranslation()

    return (
      <TextField
        disabled={disabled}
        label={t('server.connection.port')}
        variant="outlined"
        size="small"
        sx={{ width: 80 }}
        value={port}
        data-testid="server-port-input"
        slotProps={{
          input: {
            inputComponent: UintInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
            inputProps: maskInputProps({ set: (v: string) => onPortChange(Number(v)) })
          }
        }}
      />
    )
  }
)

const TcpUdpConfig = ({
  host,
  port,
  onHostChange,
  onPortChange,
  disabled
}: TcpUdpConfigProps): JSX.Element => {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center' }}>
      <HostField host={host} onHostChange={onHostChange} disabled={disabled} />
      <Box sx={{ display: 'flex', fontSize: 20, alignItems: 'center', pb: 0.5, px: 0.75 }}>:</Box>
      <PortField port={port} onPortChange={onPortChange} disabled={disabled} />
    </Box>
  )
}

export default TcpUdpConfig
