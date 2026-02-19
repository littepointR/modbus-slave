import {
  Autocomplete,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField
} from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { SerialConfig } from '@shared'
import { useTranslation } from 'react-i18next'
import { AutocompleteRenderInputParams } from '@mui/material'

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const
const DATA_BITS = [7, 8] as const
const STOP_BITS = [1, 2] as const
const PARITY_OPTIONS = ['none', 'even', 'odd'] as const

interface SerialConfigProps {
  config: SerialConfig
  onChange: (config: SerialConfig) => void
  disabled?: boolean
  serialPorts?: string[]
  loading?: boolean
}

const PortField = meme(
  ({
    port,
    onChange,
    disabled,
    serialPorts = [],
    loading
  }: {
    port: string
    onChange: (port: string) => void
    disabled?: boolean
    serialPorts?: string[]
    loading?: boolean
  }) => {
    const { t } = useTranslation()

    return (
      <Autocomplete
        freeSolo
        disabled={disabled}
        options={serialPorts}
        value={port}
        data-testid="server-serial-port-input"
        onInputChange={(_event, newValue) => onChange(newValue)}
        onChange={(_event, newValue) => newValue && onChange(newValue)}
        sx={{ width: 180 }}
        renderInput={(params: AutocompleteRenderInputParams) => (
          <TextField
            {...params}
            label={t('server.connection.comPort')}
            variant="outlined"
            size="small"
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading ? <CircularProgress size={16} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                )
              }
            }}
          />
        )}
      />
    )
  }
)

const BaudRateSelect = meme(
  ({
    baudRate,
    onChange,
    disabled
  }: {
    baudRate: number
    onChange: (rate: number) => void
    disabled?: boolean
  }) => {
    const { t } = useTranslation()
    const labelId = 'server-baud-rate-select'

    return (
      <FormControl size="small">
        <InputLabel id={labelId}>{t('server.connection.baudRate')}</InputLabel>
        <Select
          disabled={disabled}
          size="small"
          labelId={labelId}
          value={baudRate}
          label={t('server.connection.baudRate')}
          onChange={(e) => onChange(Number(e.target.value))}
          sx={{ width: 100 }}
          data-testid="server-baudrate-select"
        >
          {BAUD_RATES.map((rate) => (
            <MenuItem key={`baud_${rate}`} value={rate}>
              {rate}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
)

const DataBitsSelect = meme(
  ({
    dataBits,
    onChange,
    disabled
  }: {
    dataBits: number
    onChange: (bits: number) => void
    disabled?: boolean
  }) => {
    const { t } = useTranslation()
    const labelId = 'server-databits-select'

    return (
      <FormControl size="small">
        <InputLabel id={labelId}>{t('server.connection.dataBits')}</InputLabel>
        <Select
          disabled={disabled}
          size="small"
          labelId={labelId}
          value={dataBits}
          label={t('server.connection.dataBits')}
          onChange={(e) => onChange(Number(e.target.value))}
          sx={{ width: 80 }}
          data-testid="server-databits-select"
        >
          {DATA_BITS.map((bits) => (
            <MenuItem key={`databits_${bits}`} value={bits}>
              {bits}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
)

const StopBitsSelect = meme(
  ({
    stopBits,
    onChange,
    disabled
  }: {
    stopBits: number
    onChange: (bits: number) => void
    disabled?: boolean
  }) => {
    const { t } = useTranslation()
    const labelId = 'server-stopbits-select'

    return (
      <FormControl size="small">
        <InputLabel id={labelId}>{t('server.connection.stopBits')}</InputLabel>
        <Select
          disabled={disabled}
          size="small"
          labelId={labelId}
          value={stopBits}
          label={t('server.connection.stopBits')}
          onChange={(e) => onChange(Number(e.target.value))}
          sx={{ width: 80 }}
          data-testid="server-stopbits-select"
        >
          {STOP_BITS.map((bits) => (
            <MenuItem key={`stopbits_${bits}`} value={bits}>
              {bits}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
)

const ParitySelect = meme(
  ({
    parity,
    onChange,
    disabled
  }: {
    parity: string
    onChange: (parity: 'none' | 'even' | 'odd') => void
    disabled?: boolean
  }) => {
    const { t } = useTranslation()
    const labelId = 'server-parity-select'

    return (
      <FormControl size="small">
        <InputLabel id={labelId}>{t('server.connection.parity')}</InputLabel>
        <Select
          disabled={disabled}
          size="small"
          labelId={labelId}
          value={parity}
          label={t('server.connection.parity')}
          onChange={(e) => onChange(e.target.value as 'none' | 'even' | 'odd')}
          sx={{ width: 80 }}
          data-testid="server-parity-select"
        >
          {PARITY_OPTIONS.map((option) => (
            <MenuItem key={`parity_${option}`} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
)

const SerialConfigComponent = ({
  config,
  onChange,
  disabled,
  serialPorts = [],
  loading
}: SerialConfigProps): JSX.Element => {
  const updateConfig = (updates: Partial<SerialConfig>) => {
    onChange({ ...config, ...updates })
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 2 }}>
        <PortField
          port={config.port}
          onChange={(port) => updateConfig({ port })}
          disabled={disabled}
          serialPorts={serialPorts}
          loading={loading}
        />
        <BaudRateSelect
          baudRate={config.baudRate}
          onChange={(baudRate) => updateConfig({ baudRate })}
          disabled={disabled}
        />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 2 }}>
        <ParitySelect
          parity={config.parity}
          onChange={(parity) => updateConfig({ parity })}
          disabled={disabled}
        />
        <DataBitsSelect
          dataBits={config.dataBits}
          onChange={(dataBits) => updateConfig({ dataBits })}
          disabled={disabled}
        />
        <StopBitsSelect
          stopBits={config.stopBits}
          onChange={(stopBits) => updateConfig({ stopBits })}
          disabled={disabled}
        />
      </Box>
    </Box>
  )
}

export default SerialConfigComponent
