import { Box } from '@mui/material'
import { ServerConnectionConfig, ServerProtocol } from '@shared'
import ServerProtocolSelector from './ServerProtocolSelector'
import TcpUdpConfig from './TcpUdpConfig/TcpUdpConfig'
import SerialConfig from './SerialConfig/SerialConfig'

export interface ServerConfigProps {
  config: ServerConnectionConfig
  onChange: (config: ServerConnectionConfig) => void
  disabled?: boolean
  serialPorts?: string[]
  serialPortsLoading?: boolean
}

const DEFAULT_TCP_HOST = '0.0.0.0'
const DEFAULT_TCP_PORT = 502
const DEFAULT_SERIAL_CONFIG = {
  port: '',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none' as const
}

const isTcpUdpProtocol = (protocol: ServerProtocol): boolean => {
  return (
    protocol === 'ModbusTcp' ||
    protocol === 'ModbusUdp' ||
    protocol === 'ModbusRtuOverTcp' ||
    protocol === 'ModbusRtuOverUdp'
  )
}

const isSerialProtocol = (protocol: ServerProtocol): boolean => {
  return protocol === 'ModbusRtu' || protocol === 'ModbusAscii'
}

const ServerConfig = ({
  config,
  onChange,
  disabled,
  serialPorts = [],
  serialPortsLoading
}: ServerConfigProps): JSX.Element => {
  const handleProtocolChange = (protocol: ServerProtocol) => {
    const newConfig: ServerConnectionConfig = { protocol }

    if (isTcpUdpProtocol(protocol)) {
      newConfig.host = config.host ?? DEFAULT_TCP_HOST
      newConfig.port = config.port ?? DEFAULT_TCP_PORT
    } else if (isSerialProtocol(protocol)) {
      newConfig.serial = config.serial ?? DEFAULT_SERIAL_CONFIG
    }

    onChange(newConfig)
  }

  const handleHostChange = (host: string) => {
    onChange({ ...config, host })
  }

  const handlePortChange = (port: number) => {
    onChange({ ...config, port })
  }

  const handleSerialChange = (serial: {
    port: string
    baudRate: number
    dataBits: number
    stopBits: number
    parity: 'none' | 'even' | 'odd'
  }) => {
    onChange({ ...config, serial })
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
      <ServerProtocolSelector
        value={config.protocol}
        onChange={handleProtocolChange}
        disabled={disabled}
      />

      {isTcpUdpProtocol(config.protocol) && (
        <TcpUdpConfig
          host={config.host ?? DEFAULT_TCP_HOST}
          port={config.port ?? DEFAULT_TCP_PORT}
          onHostChange={handleHostChange}
          onPortChange={handlePortChange}
          disabled={disabled}
        />
      )}

      {isSerialProtocol(config.protocol) && config.serial && (
        <SerialConfig
          config={config.serial}
          onChange={handleSerialChange}
          disabled={disabled}
          serialPorts={serialPorts}
          loading={serialPortsLoading}
        />
      )}
    </Box>
  )
}

export default ServerConfig
