import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { ServerProtocol, ServerProtocolSchema } from '@shared'
import { useTranslation } from 'react-i18next'

interface ServerProtocolSelectorProps {
  value: ServerProtocol
  onChange: (protocol: ServerProtocol) => void
  disabled?: boolean
}

const ServerProtocolSelector = meme(
  ({ value, onChange, disabled }: ServerProtocolSelectorProps): JSX.Element => {
    const { t } = useTranslation()
    const labelId = 'server-protocol-select'

    const protocolOptions: { value: ServerProtocol; label: string }[] = [
      { value: 'ModbusTcp', label: 'TCP' },
      { value: 'ModbusUdp', label: 'UDP' },
      { value: 'ModbusRtu', label: 'RTU' },
      { value: 'ModbusAscii', label: 'ASCII' },
      { value: 'ModbusRtuOverTcp', label: 'RTU over TCP' },
      { value: 'ModbusRtuOverUdp', label: 'RTU over UDP' }
    ]

    return (
      <FormControl size="small">
        <InputLabel id={labelId}>{t('server.connection.protocol')}</InputLabel>
        <Select
          disabled={disabled}
          size="small"
          labelId={labelId}
          value={value}
          label={t('server.connection.protocol')}
          onChange={(e) => {
            const result = ServerProtocolSchema.safeParse(e.target.value)
            if (result.success) onChange(result.data)
          }}
          sx={{ minWidth: 140 }}
          data-testid="server-protocol-select"
        >
          {protocolOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
)

export default ServerProtocolSelector
