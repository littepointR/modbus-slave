import { useState, useRef, useEffect, memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { sendEvent } from '@renderer/events'
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Paper,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  Divider,
  Chip,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  TablePagination,
  Switch,
  Autocomplete,
  CircularProgress
} from '@mui/material'
import {
  Add as AddIcon,
  CreateNewFolder as NewConnectionIcon,
  DeviceHub as NewSlaveIcon,
  FolderOpen as OpenIcon,
  Save as SaveIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  SettingsEthernet as CommDetailsIcon,
  Code as ScriptIcon,
  Delete as DeleteIcon,
  DeviceHub as DeviceIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Circle as CircleIcon,
  ToggleOn as CoilIcon,
  ToggleOff as DiscreteInputIcon,
  Storage as HoldingRegisterIcon,
  Input as InputRegisterIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material'
import { v4 as uuidv4 } from 'uuid'
import SettingsMenu from '@renderer/components/shared/SettingsMenu'
import type { CreateServerParams, ServerConnectionConfig } from '@shared'

// =============================================================================
// TYPES
// =============================================================================

interface Register {
  address: number
  value: number
  variableName: string
  comment: string
}

interface RegisterGroup {
  id: string
  name: string
  type: '01' | '02' | '03' | '04'
  startAddress: number
  count: number
  registers: Register[]
}

interface Slave {
  id: string
  alias: string
  slaveId: number
  responseDelay: number
  initMode: 'none' | 'random' | 'address'
  addressType: 'protocol' | 'plc'
  registerGroups: RegisterGroup[]
}

interface Connection {
  id: string
  alias: string
  mode: 'rtu' | 'tcp' | 'udp' | 'rtuovertcp' | 'rtuoverudp'
  serialPort?: string
  baudRate?: number
  dataBits?: number
  parity?: 'none' | 'even' | 'odd'
  stopBits?: number
  flowControl?: 'none' | 'rtscts' | 'xonxoff'
  frameFormat?: 'rtu' | 'ascii'
  ipAddress?: string
  port?: number
  isOpen: boolean
  slaves: Slave[]
}

const toServerConfig = (connection: Connection): ServerConnectionConfig => {
  switch (connection.mode) {
    case 'tcp':
      return {
        protocol: 'ModbusTcp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502
      }
    case 'udp':
      return {
        protocol: 'ModbusUdp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502
      }
    case 'rtuovertcp':
      return {
        protocol: 'ModbusRtuOverTcp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502
      }
    case 'rtuoverudp':
      return {
        protocol: 'ModbusRtuOverUdp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502
      }
    case 'rtu':
    default:
      return {
        protocol: connection.frameFormat === 'ascii' ? 'ModbusAscii' : 'ModbusRtu',
        serial: {
          port: connection.serialPort || '',
          baudRate: connection.baudRate || 9600,
          dataBits: connection.dataBits || 8,
          stopBits: connection.stopBits || 1,
          parity: connection.parity || 'none'
        }
      }
  }
}

interface OpenTab {
  connectionId: string
  slaveId: string
  registerGroupId: string
  selectedAddresses: Set<number>
  interpretationTab: 'basic' | 'long' | 'float' | 'double' | 'string'
  stringEncoding: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ENCODING_OPTIONS = [
  'ASCII',
  'UTF-8',
  'UTF-16',
  'UTF-16BE',
  'UTF-16LE',
  'GB2312',
  'GBK',
  'GB18030',
  'ISO-8859-1'
]

// =============================================================================
// HELPERS
// =============================================================================

const createRegisters = (
  startAddress: number,
  count: number,
  initMode: 'none' | 'random' | 'address',
  registerType: RegisterGroup['type'] = '03'
): Register[] => {
  return Array.from({ length: count }, (_, i) => {
    let value = 0
    if (initMode === 'address') {
      value = startAddress + i
    } else if (initMode === 'random') {
      if (registerType === '01' || registerType === '02') {
        value = Math.random() < 0.5 ? 0 : 1
      } else {
        value = Math.floor(Math.random() * 65536)
      }
    }
    return {
      address: startAddress + i,
      value,
      variableName: '',
      comment: ''
    }
  })
}

const createDefaultRegisterGroup = (): RegisterGroup => ({
  id: uuidv4(),
  name: 'Default Group',
  type: '03',
  startAddress: 0,
  count: 10,
  registers: createRegisters(0, 10, 'none')
})

const createDefaultSlave = (): Slave => ({
  id: uuidv4(),
  alias: 'Slave 1',
  slaveId: 1,
  responseDelay: 0,
  initMode: 'none',
  addressType: 'protocol',
  registerGroups: [createDefaultRegisterGroup()]
})

const getRegisterTypeName = (type: string) => {
  const names: Record<string, string> = {
    '01': 'Coil (0x)',
    '02': 'Discrete Input (1x)',
    '03': 'Holding Register (4x)',
    '04': 'Input Register (3x)'
  }
  return names[type] || type
}

const getRegisterTypeIcon = (type: string) => {
  const icons: Record<string, React.ReactNode> = {
    '01': <CoilIcon sx={{ fontSize: 16, color: '#4caf50' }} />,
    '02': <DiscreteInputIcon sx={{ fontSize: 16, color: '#ff9800' }} />,
    '03': <HoldingRegisterIcon sx={{ fontSize: 16, color: '#2196f3' }} />,
    '04': <InputRegisterIcon sx={{ fontSize: 16, color: '#9c27b0' }} />
  }
  return icons[type] || <CircleIcon sx={{ fontSize: 12 }} />
}

const getRegisterTypeChip = (type: string) => {
  const colors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning'> = {
    '01': 'success',
    '02': 'warning',
    '03': 'primary',
    '04': 'secondary'
  }
  return <Chip label={getRegisterTypeName(type)} size="small" color={colors[type] || 'default'} />
}

const formatAddress = (address: number): string => {
  return `0x${address.toString(16).toUpperCase().padStart(4, '0')}`
}

const registersToUint32 = (
  registers: Register[],
  byteOrder: 'ABCD' | 'CDAB' | 'BADC' | 'DCBA'
): number => {
  const v0 = registers[0]?.value || 0
  const v1 = registers[1]?.value || 0
  switch (byteOrder) {
    case 'ABCD':
      return (v0 << 16) | v1
    case 'CDAB':
      return (v1 << 16) | v0
    case 'BADC':
      return ((v0 & 0xff00) >> 8) | ((v0 & 0xff) << 8) | ((v1 & 0xff00) << 8) | ((v1 & 0xff) << 24)
    case 'DCBA':
      return ((v1 & 0xff00) >> 8) | ((v1 & 0xff) << 8) | ((v0 & 0xff00) << 8) | ((v0 & 0xff) << 24)
    default:
      return (v0 << 16) | v1
  }
}

const registersToFloat32 = (
  registers: Register[],
  byteOrder: 'ABCD' | 'CDAB' | 'BADC' | 'DCBA'
): number => {
  const uint32 = registersToUint32(registers, byteOrder)
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setUint32(0, uint32)
  return view.getFloat32(0)
}

const registersToFloat64 = (
  registers: Register[],
  byteOrder: 'ABCDEFGH' | 'GHEFCDAB' | 'BADCFEHG' | 'HGFEDCBA'
): number => {
  const v0 = registers[0]?.value || 0
  const v1 = registers[1]?.value || 0
  const v2 = registers[2]?.value || 0
  const v3 = registers[3]?.value || 0

  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)

  switch (byteOrder) {
    case 'ABCDEFGH':
      view.setUint16(0, v0)
      view.setUint16(2, v1)
      view.setUint16(4, v2)
      view.setUint16(6, v3)
      break
    case 'GHEFCDAB':
      view.setUint16(0, v3)
      view.setUint16(2, v2)
      view.setUint16(4, v1)
      view.setUint16(6, v0)
      break
    case 'BADCFEHG':
      view.setUint16(0, ((v0 & 0xff) << 8) | ((v0 & 0xff00) >> 8))
      view.setUint16(2, ((v1 & 0xff) << 8) | ((v1 & 0xff00) >> 8))
      view.setUint16(4, ((v2 & 0xff) << 8) | ((v2 & 0xff00) >> 8))
      view.setUint16(6, ((v3 & 0xff) << 8) | ((v3 & 0xff00) >> 8))
      break
    case 'HGFEDCBA':
      view.setUint16(0, ((v3 & 0xff) << 8) | ((v3 & 0xff00) >> 8))
      view.setUint16(2, ((v2 & 0xff) << 8) | ((v2 & 0xff00) >> 8))
      view.setUint16(4, ((v1 & 0xff) << 8) | ((v1 & 0xff00) >> 8))
      view.setUint16(6, ((v0 & 0xff) << 8) | ((v0 & 0xff00) >> 8))
      break
    default:
      view.setUint16(0, v0)
      view.setUint16(2, v1)
      view.setUint16(4, v2)
      view.setUint16(6, v3)
  }

  return view.getFloat64(0)
}

const extractConsecutiveGroups = <T extends { address: number }>(
  registers: T[],
  groupSize: number
): T[][] => {
  if (registers.length < groupSize) return []

  const sorted = [...registers].sort((a, b) => a.address - b.address)
  const groups: T[][] = []

  let currentGroup: T[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]

    if (curr.address === prev.address + 1) {
      currentGroup.push(curr)
    } else {
      while (currentGroup.length >= groupSize) {
        groups.push(currentGroup.slice(0, groupSize))
        currentGroup = currentGroup.slice(groupSize)
      }
      currentGroup = [curr]
    }
  }

  while (currentGroup.length >= groupSize) {
    groups.push(currentGroup.slice(0, groupSize))
    currentGroup = currentGroup.slice(groupSize)
  }

  return groups
}

// =============================================================================
// COMPONENTS
// =============================================================================

interface NewConnectionDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (connection: Connection) => void
  initialConnection?: Connection
}

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const

const NewConnectionDialog = ({
  open,
  onClose,
  onConfirm,
  initialConnection
}: NewConnectionDialogProps) => {
  const { t } = useTranslation()
  const isEditMode = !!initialConnection

  const [alias, setAlias] = useState(initialConnection?.alias || '')
  const [mode, setMode] = useState<Connection['mode']>(initialConnection?.mode || 'tcp')
  const [serialPort, setSerialPort] = useState(initialConnection?.serialPort || '')
  const [baudRate, setBaudRate] = useState<number | string>(initialConnection?.baudRate || 9600)
  const [dataBits, setDataBits] = useState(initialConnection?.dataBits || 8)
  const [parity, setParity] = useState<'none' | 'even' | 'odd'>(initialConnection?.parity || 'none')
  const [stopBits, setStopBits] = useState(initialConnection?.stopBits || 1)
  const [flowControl, setFlowControl] = useState<'none' | 'rtscts' | 'xonxoff'>(
    initialConnection?.flowControl || 'none'
  )
  const [frameFormat, setFrameFormat] = useState<'rtu' | 'ascii'>(
    initialConnection?.frameFormat || 'rtu'
  )
  const [ipAddress, setIpAddress] = useState(initialConnection?.ipAddress || '127.0.0.1')
  const [port, setPort] = useState(initialConnection?.port || 502)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [availablePorts, setAvailablePorts] = useState<string[]>([])
  const [scanningPorts, setScanningPorts] = useState(false)

  useEffect(() => {
    if (open) {
      const newAlias = initialConnection?.alias || ''
      const newMode = initialConnection?.mode || 'tcp'
      const newSerialPort = initialConnection?.serialPort || ''
      const newBaudRate = initialConnection?.baudRate || 9600
      const newIpAddress = initialConnection?.ipAddress || '127.0.0.1'
      const newPort = initialConnection?.port || 502

      setAlias(newAlias)
      setMode(newMode)
      setSerialPort(newSerialPort)
      setBaudRate(newBaudRate)
      setDataBits(initialConnection?.dataBits || 8)
      setParity(initialConnection?.parity || 'none')
      setStopBits(initialConnection?.stopBits || 1)
      setFlowControl(initialConnection?.flowControl || 'none')
      setFrameFormat(initialConnection?.frameFormat || 'rtu')
      setIpAddress(newIpAddress)
      setPort(newPort)

      const newErrors: Record<string, string> = {}
      if (!newAlias.trim()) {
        newErrors.alias = t('validation.required')
      }
      if (newMode === 'rtu') {
        if (!newSerialPort.trim()) {
          newErrors.serialPort = t('validation.required')
        }
        const baudNum = Number(newBaudRate)
        if (isNaN(baudNum) || baudNum < 1 || baudNum > 10000000) {
          newErrors.baudRate = t('validation.baudRate')
        }
      } else {
        if (!validateIp(newIpAddress)) {
          newErrors.ipAddress = t('validation.ipAddress')
        }
        if (newPort < 1 || newPort > 65535) {
          newErrors.port = t('validation.portRange')
        }
      }
      setErrors(newErrors)

      if (newMode === 'rtu' || !initialConnection) {
        scanSerialPorts()
      }
    }
  }, [open, initialConnection])

  const scanSerialPorts = async () => {
    setScanningPorts(true)
    try {
      const ports = await window.api.listSerialPorts()
      setAvailablePorts(ports.map((p) => p.path))
      if (ports.length === 0) {
        console.warn('[SerialPort] No serial ports found on this system')
      }
    } catch (err) {
      console.error('[SerialPort] Failed to scan ports:', err)
      setAvailablePorts([])
    } finally {
      setScanningPorts(false)
    }
  }

  const validateIp = (ip: string): boolean => {
    const regex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!regex.test(ip)) return false
    const parts = ip.split('.')
    return parts.every((p) => {
      const num = parseInt(p)
      return num >= 0 && num <= 255
    })
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!alias.trim()) {
      newErrors.alias = t('validation.required')
    }

    if (mode === 'rtu') {
      if (!serialPort.trim()) {
        newErrors.serialPort = t('validation.required')
      }
      const baudNum = Number(baudRate)
      if (isNaN(baudNum) || baudNum < 1 || baudNum > 10000000) {
        newErrors.baudRate = t('validation.baudRate')
      }
    } else {
      if (!validateIp(ipAddress)) {
        newErrors.ipAddress = t('validation.ipAddress')
      }
      if (port < 1 || port > 65535) {
        newErrors.port = t('validation.portRange')
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleConfirm = () => {
    if (!validateForm()) return

    const connection: Connection = {
      id: isEditMode ? initialConnection!.id : uuidv4(),
      alias: alias.trim() || (isEditMode ? initialConnection!.alias : 'New Connection'),
      mode,
      isOpen: isEditMode ? initialConnection!.isOpen : false,
      slaves: isEditMode ? initialConnection!.slaves : [createDefaultSlave()],
      ...(mode === 'rtu'
        ? {
            serialPort,
            baudRate: Number(baudRate),
            dataBits,
            parity,
            stopBits,
            flowControl,
            frameFormat
          }
        : {
            ipAddress,
            port
          })
    }

    onConfirm(connection)
    onClose()
  }

  const isValid =
    mode === 'rtu'
      ? alias.trim() && serialPort.trim() && !isNaN(Number(baudRate)) && Number(baudRate) > 0
      : alias.trim() && validateIp(ipAddress) && port >= 1 && port <= 65535

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEditMode ? t('server.dialog.editConnection') : t('server.dialog.newConnection')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Connection Alias"
            value={alias}
            onChange={(e) => {
              setAlias(e.target.value)
              if (errors.alias) setErrors((prev) => ({ ...prev, alias: '' }))
            }}
            onBlur={() => {
              if (!alias.trim()) {
                setErrors((prev) => ({ ...prev, alias: t('validation.required') }))
              }
            }}
            error={!!errors.alias}
            helperText={errors.alias || ' '}
            fullWidth
            required
          />
          <FormControl fullWidth variant="outlined">
            <InputLabel size="small">Connection Mode</InputLabel>
            <Select
              value={mode}
              onChange={(e) => {
                const newMode = e.target.value as Connection['mode']
                setMode(newMode)
                setErrors((prevErrors) => {
                  const newErrors = { ...prevErrors }
                  delete newErrors.serialPort
                  delete newErrors.baudRate
                  delete newErrors.ipAddress
                  delete newErrors.port

                  if (newMode === 'rtu') {
                    if (!serialPort.trim()) {
                      newErrors.serialPort = t('validation.required')
                    }
                    const baudNum = Number(baudRate)
                    if (isNaN(baudNum) || baudNum < 1 || baudNum > 10000000) {
                      newErrors.baudRate = t('validation.baudRate')
                    }
                    scanSerialPorts()
                  } else {
                    if (!validateIp(ipAddress)) {
                      newErrors.ipAddress = t('validation.ipAddress')
                    }
                    if (port < 1 || port > 65535) {
                      newErrors.port = t('validation.portRange')
                    }
                  }
                  return newErrors
                })
              }}
              label="Connection Mode"
              size="small"
            >
              <MenuItem value="rtu">Modbus RTU</MenuItem>
              <MenuItem value="tcp">Modbus TCP/IP</MenuItem>
              <MenuItem value="udp">Modbus UDP/IP</MenuItem>
              <MenuItem value="rtuovertcp">Modbus RTU Over TCP/IP</MenuItem>
              <MenuItem value="rtuoverudp">Modbus RTU Over UDP/IP</MenuItem>
            </Select>
          </FormControl>
          <Divider />
          {mode === 'rtu' ? (
            <>
              <Typography variant="subtitle2">Serial Configuration</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Autocomplete
                  freeSolo
                  options={availablePorts}
                  value={serialPort}
                  onInputChange={(_, newValue) => {
                    setSerialPort(newValue)
                    if (errors.serialPort) setErrors((prev) => ({ ...prev, serialPort: '' }))
                  }}
                  onChange={(_, newValue) => {
                    if (newValue) {
                      setSerialPort(newValue)
                      if (errors.serialPort) setErrors((prev) => ({ ...prev, serialPort: '' }))
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Serial Port"
                      size="small"
                      required
                      error={!!errors.serialPort}
                      helperText={errors.serialPort || ' '}
                      onBlur={() => {
                        if (!serialPort.trim()) {
                          setErrors((prev) => ({ ...prev, serialPort: t('validation.required') }))
                        }
                      }}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {scanningPorts ? (
                              <CircularProgress size={16} sx={{ mr: 1 }} />
                            ) : (
                              <Tooltip title="Refresh serial ports">
                                <IconButton
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    scanSerialPorts()
                                  }}
                                  disabled={scanningPorts}
                                  size="small"
                                  sx={{ p: 0.5, mr: 0.5 }}
                                >
                                  <RefreshIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {params.InputProps.endAdornment}
                          </>
                        )
                      }}
                    />
                  )}
                />
                <Autocomplete
                  freeSolo
                  options={BAUD_RATES.map(String)}
                  value={String(baudRate)}
                  onInputChange={(_, newValue) => {
                    setBaudRate(newValue)
                    const baudNum = Number(newValue)
                    if (!newValue || isNaN(baudNum) || baudNum < 1 || baudNum > 10000000) {
                      setErrors((prev) => ({ ...prev, baudRate: t('validation.baudRate') }))
                    } else {
                      setErrors((prev) => ({ ...prev, baudRate: '' }))
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Baud Rate"
                      size="small"
                      required
                      error={!!errors.baudRate}
                      helperText={errors.baudRate || ' '}
                    />
                  )}
                />
                <FormControl fullWidth variant="outlined">
                  <InputLabel size="small">Data Bits</InputLabel>
                  <Select
                    value={dataBits}
                    onChange={(e) => setDataBits(Number(e.target.value))}
                    label="Data Bits"
                    size="small"
                  >
                    {[5, 6, 7, 8].map((b) => (
                      <MenuItem key={b} value={b}>
                        {b}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth variant="outlined">
                  <InputLabel size="small">Parity</InputLabel>
                  <Select
                    value={parity}
                    onChange={(e) => setParity(e.target.value as typeof parity)}
                    label="Parity"
                    size="small"
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="even">Even</MenuItem>
                    <MenuItem value="odd">Odd</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth variant="outlined">
                  <InputLabel size="small">Stop Bits</InputLabel>
                  <Select
                    value={stopBits}
                    onChange={(e) => setStopBits(Number(e.target.value))}
                    label="Stop Bits"
                    size="small"
                  >
                    {[1, 1.5, 2].map((b) => (
                      <MenuItem key={b} value={b}>
                        {b}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth variant="outlined">
                  <InputLabel size="small">Flow Control</InputLabel>
                  <Select
                    value={flowControl}
                    onChange={(e) => setFlowControl(e.target.value as typeof flowControl)}
                    label="Flow Control"
                    size="small"
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="rtscts">RTS/CTS</MenuItem>
                    <MenuItem value="xonxoff">XON/XOFF</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Typography variant="subtitle2">Frame Format</Typography>
              <RadioGroup
                value={frameFormat}
                onChange={(e) => setFrameFormat(e.target.value as 'rtu' | 'ascii')}
              >
                <FormControlLabel value="rtu" control={<Radio />} label="RTU" />
                <FormControlLabel value="ascii" control={<Radio />} label="ASCII" />
              </RadioGroup>
            </>
          ) : (
            <>
              <TextField
                label="IP Address"
                value={ipAddress}
                onChange={(e) => {
                  setIpAddress(e.target.value)
                  if (errors.ipAddress) setErrors((prev) => ({ ...prev, ipAddress: '' }))
                }}
                onBlur={() => {
                  if (!validateIp(ipAddress)) {
                    setErrors((prev) => ({ ...prev, ipAddress: t('validation.ipAddress') }))
                  }
                }}
                error={!!errors.ipAddress}
                helperText={errors.ipAddress || ' '}
                fullWidth
                required
              />
              <TextField
                label="Port"
                type="number"
                value={port}
                onChange={(e) => {
                  setPort(Number(e.target.value))
                  if (errors.port) setErrors((prev) => ({ ...prev, port: '' }))
                }}
                onBlur={() => {
                  if (port < 1 || port > 65535) {
                    setErrors((prev) => ({ ...prev, port: t('validation.portRange') }))
                  }
                }}
                error={!!errors.port}
                helperText={errors.port || ' '}
                fullWidth
                inputProps={{ min: 1, max: 65535 }}
                required
              />
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={!isValid}>
          {isEditMode ? 'Save' : 'OK'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface NewSlaveDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (slave: Slave) => void
  initialSlave?: Slave
}

const NewSlaveDialog = ({ open, onClose, onConfirm, initialSlave }: NewSlaveDialogProps) => {
  const { t } = useTranslation()
  const isEditMode = !!initialSlave
  const [alias, setAlias] = useState(initialSlave?.alias || '')
  const [slaveId, setSlaveId] = useState(initialSlave?.slaveId || 1)
  const [responseDelay, setResponseDelay] = useState(initialSlave?.responseDelay || 0)
  const [initMode, setInitMode] = useState<'none' | 'random' | 'address'>(
    initialSlave?.initMode || 'none'
  )
  const [addressType, setAddressType] = useState<'protocol' | 'plc'>(
    initialSlave?.addressType || 'protocol'
  )
  const [registerGroups, setRegisterGroups] = useState<RegisterGroup[]>(
    initialSlave?.registerGroups || [createDefaultRegisterGroup()]
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      const newAlias = initialSlave?.alias || ''
      const newSlaveId = initialSlave?.slaveId || 1
      const newResponseDelay = initialSlave?.responseDelay || 0

      setAlias(newAlias)
      setSlaveId(newSlaveId)
      setResponseDelay(newResponseDelay)
      setInitMode(initialSlave?.initMode || 'none')
      setAddressType(initialSlave?.addressType || 'protocol')
      const newGroups = initialSlave?.registerGroups || [createDefaultRegisterGroup()]
      setRegisterGroups(newGroups)

      const newErrors: Record<string, string> = {}
      if (!newAlias.trim()) {
        newErrors.alias = t('validation.required')
      }
      if (newSlaveId < 1 || newSlaveId > 247) {
        newErrors.slaveId = t('validation.slaveIdRange')
      }
      if (newResponseDelay < 0) {
        newErrors.responseDelay = t('validation.positiveNumber')
      }

      newGroups.forEach((group, index) => {
        if (group.startAddress < 0) {
          newErrors[`group_${index}_startAddress`] = t('validation.positiveNumber')
        }
        if (group.count < 1 || group.count > 65535) {
          newErrors[`group_${index}_count`] = t('validation.countRange')
        }
      })

      setErrors(newErrors)
    }
  }, [open, initialSlave])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!alias.trim()) {
      newErrors.alias = t('validation.required')
    }

    if (slaveId < 1 || slaveId > 247) {
      newErrors.slaveId = t('validation.slaveIdRange')
    }

    if (responseDelay < 0) {
      newErrors.responseDelay = t('validation.positiveNumber')
    }

    registerGroups.forEach((group, index) => {
      if (group.startAddress < 0) {
        newErrors[`group_${index}_startAddress`] = t('validation.positiveNumber')
      }
      if (group.count < 1 || group.count > 65535) {
        newErrors[`group_${index}_count`] = t('validation.countRange')
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleConfirm = () => {
    if (!validateForm()) return

    const slave: Slave = {
      id: isEditMode ? initialSlave!.id : uuidv4(),
      alias: alias.trim() || (isEditMode ? initialSlave!.alias : `Slave ${slaveId}`),
      slaveId,
      responseDelay,
      initMode,
      addressType,
      registerGroups
    }
    onConfirm(slave)
    onClose()
  }

  const addRegisterGroup = () => {
    setRegisterGroups([
      ...registerGroups,
      {
        id: uuidv4(),
        name: `Group ${registerGroups.length + 1}`,
        type: '03',
        startAddress: 0,
        count: 10,
        registers: createRegisters(0, 10, 'none')
      }
    ])
  }

  const removeRegisterGroup = (id: string) => {
    if (registerGroups.length <= 1) return
    setRegisterGroups(registerGroups.filter((g) => g.id !== id))
  }

  const updateRegisterGroup = (id: string, updates: Partial<RegisterGroup>) => {
    setRegisterGroups(
      registerGroups.map((g) => {
        if (g.id !== id) return g
        const newGroup = { ...g, ...updates }
        if (updates.startAddress !== undefined || updates.count !== undefined) {
          newGroup.registers = createRegisters(
            newGroup.startAddress,
            newGroup.count,
            initMode,
            newGroup.type
          )
        }
        return newGroup
      })
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEditMode ? t('server.dialog.editSlave') : t('server.dialog.newSlave')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Slave Alias"
            value={alias}
            onChange={(e) => {
              setAlias(e.target.value)
              if (errors.alias) setErrors((prev) => ({ ...prev, alias: '' }))
            }}
            onBlur={() => {
              if (!alias.trim()) {
                setErrors((prev) => ({ ...prev, alias: t('validation.required') }))
              }
            }}
            error={!!errors.alias}
            helperText={errors.alias || ' '}
            fullWidth
            required
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label="Slave ID"
              type="number"
              value={slaveId}
              onChange={(e) => {
                setSlaveId(Number(e.target.value))
                if (errors.slaveId) setErrors((prev) => ({ ...prev, slaveId: '' }))
              }}
              onBlur={() => {
                if (slaveId < 1 || slaveId > 247) {
                  setErrors((prev) => ({ ...prev, slaveId: t('validation.slaveIdRange') }))
                }
              }}
              inputProps={{ min: 1, max: 247 }}
              fullWidth
              required
              error={!!errors.slaveId}
              helperText={errors.slaveId || ' '}
            />
            <TextField
              label="Response Delay (ms)"
              type="number"
              value={responseDelay}
              onChange={(e) => {
                setResponseDelay(Number(e.target.value))
                if (errors.responseDelay) setErrors((prev) => ({ ...prev, responseDelay: '' }))
              }}
              onBlur={() => {
                if (responseDelay < 0) {
                  setErrors((prev) => ({ ...prev, responseDelay: t('validation.positiveNumber') }))
                }
              }}
              inputProps={{ min: 0 }}
              fullWidth
              error={!!errors.responseDelay}
              helperText={errors.responseDelay || ' '}
            />
          </Box>
          <FormControl fullWidth variant="outlined">
            <InputLabel size="small">Register Initialization</InputLabel>
            <Select
              value={initMode}
              onChange={(e) => setInitMode(e.target.value as typeof initMode)}
              label="Register Initialization"
              size="small"
            >
              <MenuItem value="none">Do Not Initialize</MenuItem>
              <MenuItem value="random">Random Value</MenuItem>
              <MenuItem value="address">Register Address</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth variant="outlined">
            <InputLabel size="small">Address Type</InputLabel>
            <Select
              value={addressType}
              onChange={(e) => setAddressType(e.target.value as typeof addressType)}
              label="Address Type"
              size="small"
            >
              <MenuItem value="protocol">Protocol Address (Base 0)</MenuItem>
              <MenuItem value="plc">PLC Address (Base 1)</MenuItem>
            </Select>
          </FormControl>
          <Divider />
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Register Groups
            </Typography>
            {registerGroups.map((group) => (
              <Paper
                key={group.id}
                sx={{
                  p: 2,
                  mb: 2,
                  display: 'flex',
                  gap: 2,
                  alignItems: 'center',
                  flexWrap: 'wrap'
                }}
              >
                <TextField
                  label="Group Name"
                  value={group.name}
                  onChange={(e) => updateRegisterGroup(group.id, { name: e.target.value })}
                  size="small"
                  sx={{ flex: 1, minWidth: 150 }}
                />
                <FormControl sx={{ minWidth: 200 }} variant="outlined">
                  <InputLabel size="small">Type</InputLabel>
                  <Select
                    value={group.type}
                    onChange={(e) =>
                      updateRegisterGroup(group.id, {
                        type: e.target.value as RegisterGroup['type']
                      })
                    }
                    size="small"
                    label="Type"
                  >
                    <MenuItem value="01">01 Coil (0x) R/W</MenuItem>
                    <MenuItem value="02">02 Discrete Input (1x) Read-only</MenuItem>
                    <MenuItem value="03">03 Holding Register (4x) R/W</MenuItem>
                    <MenuItem value="04">04 Input Register (3x) Read-only</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Start"
                  type="number"
                  value={group.startAddress}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    updateRegisterGroup(group.id, { startAddress: value })
                    const idx = registerGroups.findIndex((g) => g.id === group.id)
                    if (value < 0) {
                      setErrors((prev) => ({
                        ...prev,
                        [`group_${idx}_startAddress`]: t('validation.positiveNumber')
                      }))
                    } else {
                      setErrors((prev) => ({ ...prev, [`group_${idx}_startAddress`]: '' }))
                    }
                  }}
                  size="small"
                  sx={{ width: 100 }}
                  error={
                    !!errors[
                      `group_${registerGroups.findIndex((g) => g.id === group.id)}_startAddress`
                    ]
                  }
                  helperText={
                    errors[
                      `group_${registerGroups.findIndex((g) => g.id === group.id)}_startAddress`
                    ] || ' '
                  }
                />
                <TextField
                  label="Count"
                  type="number"
                  value={group.count}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    updateRegisterGroup(group.id, { count: value })
                    const idx = registerGroups.findIndex((g) => g.id === group.id)
                    if (value < 1 || value > 65535) {
                      setErrors((prev) => ({
                        ...prev,
                        [`group_${idx}_count`]: t('validation.countRange')
                      }))
                    } else {
                      setErrors((prev) => ({ ...prev, [`group_${idx}_count`]: '' }))
                    }
                  }}
                  size="small"
                  sx={{ width: 100 }}
                  error={
                    !!errors[`group_${registerGroups.findIndex((g) => g.id === group.id)}_count`]
                  }
                  helperText={
                    errors[`group_${registerGroups.findIndex((g) => g.id === group.id)}_count`] ||
                    ' '
                  }
                />
                <IconButton
                  onClick={() => removeRegisterGroup(group.id)}
                  size="small"
                  disabled={registerGroups.length <= 1}
                  title={
                    registerGroups.length <= 1 ? 'Cannot delete the last register group' : 'Delete'
                  }
                >
                  <DeleteIcon />
                </IconButton>
              </Paper>
            ))}
            <Button startIcon={<AddIcon />} onClick={addRegisterGroup}>
              Add Register Group
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained">
          {isEditMode ? 'Save' : 'OK'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface TreeNodeProps {
  label: string
  icon?: React.ReactNode
  isExpanded?: boolean
  onToggle?: () => void
  onDoubleClick?: () => void
  isSelected?: boolean
  onSelect?: () => void
  level?: number
  children?: React.ReactNode
  hasChildren?: boolean
}

const TreeNode = ({
  label,
  icon,
  isExpanded,
  onToggle,
  onDoubleClick,
  isSelected,
  onSelect,
  level = 0,
  children,
  hasChildren
}: TreeNodeProps) => {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.5,
          px: 1,
          pl: 1 + level * 2,
          cursor: 'pointer',
          bgcolor: isSelected ? 'primary.main' : 'transparent',
          color: isSelected ? 'primary.contrastText' : 'inherit',
          '&:hover': { bgcolor: isSelected ? 'primary.dark' : 'action.hover' }
        }}
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
      >
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            onToggle?.()
          }}
          sx={{ visibility: hasChildren ? 'visible' : 'hidden', color: 'inherit' }}
        >
          {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
        {icon && <Box sx={{ mr: 1, display: 'flex', alignItems: 'center' }}>{icon}</Box>}
        <Typography variant="body2" sx={{ fontWeight: isSelected ? 'bold' : 'normal' }}>
          {label}
        </Typography>
      </Box>
      {isExpanded && children}
    </Box>
  )
}

interface EditableCellProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const EditableCell = ({ value, onChange, placeholder }: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)

  const handleDoubleClick = () => {
    setIsEditing(true)
    setEditValue(value)
  }

  const handleBlur = () => {
    setIsEditing(false)
    onChange(editValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditing(false)
      onChange(editValue)
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(value)
    }
  }

  if (isEditing) {
    return (
      <TextField
        size="small"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        fullWidth
        autoFocus
        variant="standard"
      />
    )
  }

  return (
    <Typography
      variant="body2"
      onDoubleClick={handleDoubleClick}
      sx={{
        cursor: 'pointer',
        minHeight: '24px',
        display: 'flex',
        alignItems: 'center',
        color: value ? 'text.primary' : 'text.disabled'
      }}
    >
      {value || placeholder || '(双击编辑)'}
    </Typography>
  )
}

// Memoized register row component for performance
interface RegisterRowProps {
  register: Register
  groupType: string
  isSelected: boolean
  onToggleSelection: (address: number, ctrlKey: boolean, shiftKey: boolean) => void
  onUpdateVariableName: (address: number, value: string) => void
  onUpdateValue: (address: number, value: number) => void
  onUpdateComment: (address: number, value: string) => void
}

const RegisterRow = memo(
  ({
    register,
    groupType,
    isSelected,
    onToggleSelection,
    onUpdateVariableName,
    onUpdateValue,
    onUpdateComment
  }: RegisterRowProps) => {
    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        onToggleSelection(register.address, e.ctrlKey || e.metaKey, e.shiftKey)
      },
      [onToggleSelection, register.address]
    )

    const handleVariableNameChange = useCallback(
      (value: string) => {
        onUpdateVariableName(register.address, value)
      },
      [onUpdateVariableName, register.address]
    )

    const handleValueChange = useCallback(
      (value: number) => {
        onUpdateValue(register.address, value)
      },
      [onUpdateValue, register.address]
    )

    const handleCommentChange = useCallback(
      (value: string) => {
        onUpdateComment(register.address, value)
      },
      [onUpdateComment, register.address]
    )

    return (
      <TableRow selected={isSelected} hover onClick={handleClick} sx={{ cursor: 'pointer' }}>
        <TableCell padding="checkbox">
          <Checkbox checked={isSelected} />
        </TableCell>
        <TableCell>{getRegisterTypeChip(groupType)}</TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
          {formatAddress(register.address)}
        </TableCell>
        <TableCell>
          <EditableCell
            value={register.variableName}
            onChange={handleVariableNameChange}
            placeholder="Double-click to edit"
          />
        </TableCell>
        <TableCell>
          {groupType === '01' || groupType === '02' ? (
            <Switch
              checked={register.value !== 0}
              onChange={(e) => handleValueChange(e.target.checked ? 1 : 0)}
              disabled={groupType === '02'}
              size="small"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <TextField
              size="small"
              value={register.value}
              onChange={(e) => handleValueChange(Number(e.target.value))}
              sx={{ width: '100%' }}
              inputProps={{
                style: { textAlign: 'center' },
                min: 0,
                max: 65535
              }}
              type="number"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </TableCell>
        <TableCell>
          <EditableCell
            value={register.comment}
            onChange={handleCommentChange}
            placeholder="Add comment..."
          />
        </TableCell>
      </TableRow>
    )
  }
)

RegisterRow.displayName = 'RegisterRow'

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const Server = (): JSX.Element => {
  const { t } = useTranslation()
  const [connections, setConnections] = useState<Connection[]>([])
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set())
  const [expandedSlaves, setExpandedSlaves] = useState<Set<string>>(new Set())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const [newConnectionOpen, setNewConnectionOpen] = useState(false)
  const [newSlaveOpen, setNewSlaveOpen] = useState(false)
  const [selectedConnectionForSlave, setSelectedConnectionForSlave] = useState<string | null>(null)
  const lastSelectedAddressRef = useRef<number | null>(null)
  const [editConnectionOpen, setEditConnectionOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | undefined>(undefined)
  const [editSlaveOpen, setEditSlaveOpen] = useState(false)
  const [editingSlave, setEditingSlave] = useState<Slave | undefined>(undefined)
  const [editingSlaveConnectionId, setEditingSlaveConnectionId] = useState<string | null>(null)

  const [tablePagination, setTablePagination] = useState<
    Record<string, { page: number; rowsPerPage: number }>
  >({})

  useEffect(() => {
    void window.api.startCommMonitor()
    return () => {
      void window.api.stopCommMonitor()
    }
  }, [])

  const toggleConnection = (id: string) => {
    setExpandedConnections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSlave = (id: string) => {
    setExpandedSlaves((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openRegisterGroup = (connectionId: string, slaveId: string, registerGroupId: string) => {
    const tabId = `${connectionId}-${slaveId}-${registerGroupId}`
    if (!openTabs.find((t) => `${t.connectionId}-${t.slaveId}-${t.registerGroupId}` === tabId)) {
      setOpenTabs([
        ...openTabs,
        {
          connectionId,
          slaveId,
          registerGroupId,
          selectedAddresses: new Set(),
          interpretationTab: 'basic',
          stringEncoding: 'UTF-8'
        }
      ])
    }
    setActiveTabId(tabId)
  }

  const closeTab = (tabId: string) => {
    const newTabs = openTabs.filter(
      (t) => `${t.connectionId}-${t.slaveId}-${t.registerGroupId}` !== tabId
    )
    setOpenTabs(newTabs)
    if (activeTabId === tabId) {
      setActiveTabId(
        newTabs.length > 0
          ? `${newTabs[0].connectionId}-${newTabs[0].slaveId}-${newTabs[0].registerGroupId}`
          : null
      )
    }
  }

  const updateTab = (tabId: string, updates: Partial<OpenTab>) => {
    setOpenTabs(
      openTabs.map((t) =>
        `${t.connectionId}-${t.slaveId}-${t.registerGroupId}` === tabId ? { ...t, ...updates } : t
      )
    )
  }

  const toggleAddressSelection = (
    tabId: string,
    address: number,
    ctrlKey: boolean,
    shiftKey: boolean,
    allAddresses: number[]
  ) => {
    const tab = openTabs.find(
      (t) => `${t.connectionId}-${t.slaveId}-${t.registerGroupId}` === tabId
    )
    if (!tab) return

    const newSelection = new Set(tab.selectedAddresses)

    if (shiftKey && lastSelectedAddressRef.current !== null) {
      // Shift+click: select range between last selected and current
      const startIdx = allAddresses.indexOf(lastSelectedAddressRef.current)
      const endIdx = allAddresses.indexOf(address)
      if (startIdx !== -1 && endIdx !== -1) {
        const [minIdx, maxIdx] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
        for (let i = minIdx; i <= maxIdx; i++) {
          newSelection.add(allAddresses[i])
        }
      }
    } else if (ctrlKey) {
      // Ctrl+click: toggle single selection
      if (newSelection.has(address)) {
        newSelection.delete(address)
      } else {
        newSelection.add(address)
      }
      lastSelectedAddressRef.current = address
    } else {
      if (newSelection.has(address)) {
        newSelection.delete(address)
        if (lastSelectedAddressRef.current === address) {
          lastSelectedAddressRef.current = null
        }
      } else {
        newSelection.add(address)
        lastSelectedAddressRef.current = address
      }
    }

    updateTab(tabId, { selectedAddresses: newSelection })
  }

  const selectAllAddresses = (tabId: string, addresses: number[]) => {
    const tab = openTabs.find(
      (t) => `${t.connectionId}-${t.slaveId}-${t.registerGroupId}` === tabId
    )
    if (!tab) return

    const allSelected = addresses.every((addr) => tab.selectedAddresses.has(addr))
    if (allSelected) {
      updateTab(tabId, { selectedAddresses: new Set() })
    } else {
      updateTab(tabId, { selectedAddresses: new Set(addresses) })
    }
  }

  const updateRegister = (
    connectionId: string,
    slaveId: string,
    groupId: string,
    address: number,
    updates: Partial<Register>
  ) => {
    setConnections(
      connections.map((conn) => {
        if (conn.id !== connectionId) return conn
        return {
          ...conn,
          slaves: conn.slaves.map((slave) => {
            if (slave.id !== slaveId) return slave
            return {
              ...slave,
              registerGroups: slave.registerGroups.map((group) => {
                if (group.id !== groupId) return group
                return {
                  ...group,
                  registers: group.registers.map((reg) =>
                    reg.address === address ? { ...reg, ...updates } : reg
                  )
                }
              })
            }
          })
        }
      })
    )
  }

  const handleNewConnection = (connection: Connection) => {
    setConnections([...connections, connection])
    setExpandedConnections(new Set([...expandedConnections, connection.id]))
  }

  const handleNewSlave = (slave: Slave) => {
    if (!selectedConnectionForSlave) return
    setConnections(
      connections.map((c) =>
        c.id === selectedConnectionForSlave ? { ...c, slaves: [...c.slaves, slave] } : c
      )
    )
    setExpandedSlaves(new Set([...expandedSlaves, slave.id]))
  }

  const handleEditConnection = () => {
    const conn = getSelectedConnection()
    if (!conn) return
    setEditingConnection(conn)
    setEditConnectionOpen(true)
  }

  const handleSaveEditedConnection = (connection: Connection) => {
    setConnections(connections.map((c) => (c.id === connection.id ? connection : c)))
    setEditConnectionOpen(false)
    setEditingConnection(undefined)
  }

  const handleEditSlave = () => {
    const slave = getSelectedSlave()
    const conn = getSelectedConnection()
    if (!slave || !conn) return
    setEditingSlave(slave)
    setEditingSlaveConnectionId(conn.id)
    setEditSlaveOpen(true)
  }

  const handleSaveEditedSlave = (slave: Slave) => {
    if (!editingSlaveConnectionId) return
    setConnections(
      connections.map((c) =>
        c.id === editingSlaveConnectionId
          ? { ...c, slaves: c.slaves.map((s) => (s.id === slave.id ? slave : s)) }
          : c
      )
    )
    setEditSlaveOpen(false)
    setEditingSlave(undefined)
    setEditingSlaveConnectionId(null)
  }

  const handleSaveWorkspace = () => {
    const workspace = {
      version: 1,
      connections: connections.map((c) => ({
        ...c,
        isOpen: false
      }))
    }
    const json = JSON.stringify(workspace, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `modbux_workspace_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleOpenWorkspace = async (file: File | null) => {
    if (!file) return
    try {
      const text = await file.text()
      const workspace = JSON.parse(text)
      if (workspace.version === 1 && Array.isArray(workspace.connections)) {
        setConnections(workspace.connections)
        setOpenTabs([])
        setActiveTabId(null)
        setExpandedConnections(new Set())
        setExpandedSlaves(new Set())
      }
    } catch (error) {
      console.error('Failed to open workspace:', error)
    }
  }

  const getSelectedConnection = () => {
    if (!selectedNodeId) return null
    const connectionId = selectedNodeId.split('/')[0]
    return connections.find((c) => c.id === connectionId) || null
  }

  const getSelectedSlave = () => {
    if (!selectedNodeId) return null
    const parts = selectedNodeId.split('/')
    if (parts.length < 2) return null
    const connectionId = parts[0]
    const slaveId = parts[1]
    const conn = connections.find((c) => c.id === connectionId)
    return conn?.slaves.find((s) => s.id === slaveId) || null
  }

  const handleOpenConnection = async () => {
    const conn = getSelectedConnection()
    if (!conn) return
    try {
      const params: CreateServerParams = {
        uuid: conn.id,
        config: toServerConfig(conn)
      }
      await window.api.createServer(params)
      setConnections((prev) => prev.map((c) => (c.id === conn.id ? { ...c, isOpen: true } : c)))
    } catch (error) {
      console.error('Failed to open connection:', error)
    }
  }

  const handleCloseConnection = async () => {
    const conn = getSelectedConnection()
    if (!conn) return
    try {
      await window.api.deleteServer(conn.id)
      setConnections((prev) => prev.map((c) => (c.id === conn.id ? { ...c, isOpen: false } : c)))
    } catch (error) {
      console.error('Failed to close connection:', error)
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {(() => {
        const selectedConn = getSelectedConnection()
        const isConnectionSelected = selectedNodeId && !selectedNodeId.includes('/')
        const isSlaveSelected = !!getSelectedSlave()
        const isConnectionOpen = selectedConn?.isOpen
        return (
          <AppBar position="static" color="default" elevation={1}>
            <Toolbar variant="dense" sx={{ gap: 1 }}>
              <Tooltip title={t('server.toolbar.saveWorkspace')}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveWorkspace}
                >
                  {t('server.toolbar.saveWorkspace')}
                </Button>
              </Tooltip>
              <div>
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  id="workspace-file-input"
                  onChange={(e) => handleOpenWorkspace(e.target.files?.[0] || null)}
                />
                <label htmlFor="workspace-file-input">
                  <Button size="small" variant="outlined" startIcon={<OpenIcon />} component="span">
                    {t('server.toolbar.openWorkspace')}
                  </Button>
                </label>
              </div>
              <Box sx={{ width: 8 }} />
              <Tooltip title={t('server.toolbar.newConnection')}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<NewConnectionIcon />}
                  onClick={() => setNewConnectionOpen(true)}
                >
                  {t('server.toolbar.newConnection')}
                </Button>
              </Tooltip>
              <Tooltip title={t('server.toolbar.newSlave')}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<NewSlaveIcon />}
                  onClick={() => {
                    setSelectedConnectionForSlave(
                      selectedNodeId?.split('/')[0] || connections[0]?.id
                    )
                    setNewSlaveOpen(true)
                  }}
                  disabled={connections.length === 0}
                >
                  {t('server.toolbar.newSlave')}
                </Button>
              </Tooltip>
              <Tooltip title={t('server.toolbar.openConnection')}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<OpenIcon />}
                  onClick={handleOpenConnection}
                  disabled={!isConnectionSelected || isConnectionOpen}
                >
                  {t('common.connect')}
                </Button>
              </Tooltip>
              <Tooltip title={t('server.toolbar.closeConnection')}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CloseIcon />}
                  onClick={handleCloseConnection}
                  disabled={!isConnectionSelected || !isConnectionOpen}
                >
                  {t('common.disconnect')}
                </Button>
              </Tooltip>
              <Box sx={{ width: 8 }} />
              <Tooltip title={t('server.toolbar.editConnection')}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!isConnectionSelected}
                  onClick={handleEditConnection}
                  startIcon={<EditIcon />}
                >
                  {t('common.edit')}
                </Button>
              </Tooltip>
              <Tooltip title={t('server.toolbar.editSlave')}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!isSlaveSelected}
                  onClick={handleEditSlave}
                  startIcon={<DeviceIcon />}
                >
                  {t('common.edit')}
                </Button>
              </Tooltip>
              <Tooltip title={t('server.toolbar.commDetails')}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!selectedNodeId}
                  onClick={() => sendEvent('open_comm_log_window')}
                  startIcon={<CommDetailsIcon />}
                >
                  {t('transaction.title')}
                </Button>
              </Tooltip>
              <Tooltip title={t('server.toolbar.editScript')}>
                <Button size="small" variant="outlined" startIcon={<ScriptIcon />}>
                  {t('server.toolbar.editScript')}
                </Button>
              </Tooltip>
              <Box sx={{ width: 8 }} />
              <SettingsMenu />
            </Toolbar>
          </AppBar>
        )
      })()}

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Paper
          sx={{
            width: 320,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            borderRight: 1,
            borderColor: 'divider'
          }}
        >
          <Box
            sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
          >
            <Typography variant="subtitle2" fontWeight="bold">
              Connections
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            {connections.map((conn) => (
              <Box key={conn.id}>
                <TreeNode
                  label={conn.alias}
                  icon={
                    <CircleIcon
                      sx={{ fontSize: 12, color: conn.isOpen ? 'success.main' : 'text.disabled' }}
                    />
                  }
                  isExpanded={expandedConnections.has(conn.id)}
                  onToggle={() => toggleConnection(conn.id)}
                  onSelect={() => setSelectedNodeId(conn.id)}
                  isSelected={selectedNodeId === conn.id}
                  hasChildren={conn.slaves.length > 0}
                >
                  {conn.slaves.map((slave) => (
                    <Box key={slave.id}>
                      <TreeNode
                        label={`${slave.alias} (ID:${slave.slaveId})`}
                        icon={<DeviceIcon sx={{ fontSize: 16 }} />}
                        isExpanded={expandedSlaves.has(slave.id)}
                        onToggle={() => toggleSlave(slave.id)}
                        onSelect={() => setSelectedNodeId(`${conn.id}/${slave.id}`)}
                        isSelected={selectedNodeId === `${conn.id}/${slave.id}`}
                        hasChildren={slave.registerGroups.length > 0}
                        level={1}
                      >
                        {slave.registerGroups.map((group) => (
                          <TreeNode
                            key={group.id}
                            label={`${group.name}`}
                            icon={getRegisterTypeIcon(group.type)}
                            onSelect={() => setSelectedNodeId(`${conn.id}/${slave.id}/${group.id}`)}
                            onDoubleClick={() => openRegisterGroup(conn.id, slave.id, group.id)}
                            isSelected={selectedNodeId === `${conn.id}/${slave.id}/${group.id}`}
                            level={2}
                            hasChildren={false}
                          />
                        ))}
                      </TreeNode>
                    </Box>
                  ))}
                </TreeNode>
              </Box>
            ))}
          </Box>
        </Paper>

        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {(() => {
            const validTabs = openTabs.filter((tab) => {
              const conn = connections.find((c) => c.id === tab.connectionId)
              const slave = conn?.slaves.find((s) => s.id === tab.slaveId)
              const group = slave?.registerGroups.find((g) => g.id === tab.registerGroupId)
              return !!group
            })
            if (validTabs.length === 0 && openTabs.length > 0) {
              setOpenTabs([])
              setActiveTabId(null)
              return null
            }
            return validTabs.length > 0 ? (
              <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Tabs
                  value={activeTabId || false}
                  onChange={(_, value) => setActiveTabId(value)}
                  variant="scrollable"
                  scrollButtons="auto"
                >
                  {validTabs.map((tab) => {
                    const conn = connections.find((c) => c.id === tab.connectionId)
                    const slave = conn?.slaves.find((s) => s.id === tab.slaveId)
                    const group = slave?.registerGroups.find((g) => g.id === tab.registerGroupId)
                    const tabId = `${tab.connectionId}-${tab.slaveId}-${tab.registerGroupId}`
                    return (
                      <Tab
                        key={tabId}
                        value={tabId}
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption">{group?.name || 'Unknown'}</Typography>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                closeTab(tabId)
                              }}
                              sx={{ ml: 0.5, p: 0.25 }}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        }
                        sx={{ textTransform: 'none', minHeight: 40 }}
                      />
                    )
                  })}
                </Tabs>
              </Box>
            ) : null
          })()}

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {activeTabId ? (
              (() => {
                const tab = openTabs.find(
                  (t) => `${t.connectionId}-${t.slaveId}-${t.registerGroupId}` === activeTabId
                )
                if (!tab) return null
                const conn = connections.find((c) => c.id === tab.connectionId)
                const slave = conn?.slaves.find((s) => s.id === tab.slaveId)
                const group = slave?.registerGroups.find((g) => g.id === tab.registerGroupId)
                if (!group) return null

                const selectedRegisters = group.registers.filter((r) =>
                  tab.selectedAddresses.has(r.address)
                )
                const longGroups = extractConsecutiveGroups(selectedRegisters, 2)
                const floatGroups = extractConsecutiveGroups(selectedRegisters, 2)
                const doubleGroups = extractConsecutiveGroups(selectedRegisters, 4)

                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                      <Typography variant="h6" gutterBottom>
                        {group.name}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                        <Chip label={`Type: ${getRegisterTypeName(group.type)}`} color="primary" />
                        <Chip
                          label={`Start: ${formatAddress(group.startAddress)}`}
                          variant="outlined"
                        />
                        <Chip label={`Count: ${group.count}`} variant="outlined" />
                        <Chip
                          label={`Connection: ${conn?.alias}`}
                          variant="outlined"
                          size="small"
                        />
                        <Chip label={`Slave: ${slave?.alias}`} variant="outlined" size="small" />
                      </Box>

                      {(() => {
                        const paginationKey = `${tab.connectionId}-${tab.slaveId}-${tab.registerGroupId}`
                        const pagination = tablePagination[paginationKey] || {
                          page: 0,
                          rowsPerPage: 100
                        }
                        const startIndex = pagination.page * pagination.rowsPerPage
                        const endIndex = startIndex + pagination.rowsPerPage
                        const paginatedRegisters = group.registers.slice(startIndex, endIndex)

                        return (
                          <>
                            <TableContainer component={Paper} variant="outlined" sx={{ flex: 1 }}>
                              <Table size="small" stickyHeader>
                                <TableHead>
                                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell padding="checkbox" sx={{ bgcolor: 'action.hover' }}>
                                      <Checkbox
                                        indeterminate={
                                          tab.selectedAddresses.size > 0 &&
                                          tab.selectedAddresses.size < group.count
                                        }
                                        checked={tab.selectedAddresses.size === group.count}
                                        onChange={() =>
                                          selectAllAddresses(
                                            activeTabId,
                                            group.registers.map((r) => r.address)
                                          )
                                        }
                                      />
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        width: 120,
                                        bgcolor: 'action.hover'
                                      }}
                                    >
                                      Register Type
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        width: 100,
                                        bgcolor: 'action.hover'
                                      }}
                                    >
                                      Address
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        width: 180,
                                        bgcolor: 'action.hover'
                                      }}
                                    >
                                      Variable Name
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        width: 120,
                                        bgcolor: 'action.hover'
                                      }}
                                    >
                                      Value
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', bgcolor: 'action.hover' }}>
                                      Comments
                                    </TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {paginatedRegisters.map((register) => {
                                    const isSelected = tab.selectedAddresses.has(register.address)
                                    return (
                                      <TableRow
                                        key={register.address}
                                        selected={isSelected}
                                        hover
                                        onClick={(e) =>
                                          toggleAddressSelection(
                                            activeTabId,
                                            register.address,
                                            e.ctrlKey || e.metaKey,
                                            e.shiftKey,
                                            group.registers.map((r) => r.address)
                                          )
                                        }
                                        sx={{ cursor: 'pointer' }}
                                      >
                                        <TableCell padding="checkbox">
                                          <Checkbox checked={isSelected} />
                                        </TableCell>
                                        <TableCell>{getRegisterTypeChip(group.type)}</TableCell>
                                        <TableCell
                                          sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}
                                        >
                                          {formatAddress(register.address)}
                                        </TableCell>
                                        <TableCell>
                                          <EditableCell
                                            value={register.variableName}
                                            onChange={(value) =>
                                              updateRegister(
                                                tab.connectionId,
                                                tab.slaveId,
                                                tab.registerGroupId,
                                                register.address,
                                                { variableName: value }
                                              )
                                            }
                                            placeholder="Double-click to edit"
                                          />
                                        </TableCell>
                                        <TableCell>
                                          {group.type === '01' || group.type === '02' ? (
                                            <Switch
                                              checked={register.value !== 0}
                                              onChange={(e) =>
                                                updateRegister(
                                                  tab.connectionId,
                                                  tab.slaveId,
                                                  tab.registerGroupId,
                                                  register.address,
                                                  { value: e.target.checked ? 1 : 0 }
                                                )
                                              }
                                              disabled={group.type === '02'}
                                              size="small"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          ) : (
                                            <TextField
                                              size="small"
                                              value={register.value}
                                              onChange={(e) =>
                                                updateRegister(
                                                  tab.connectionId,
                                                  tab.slaveId,
                                                  tab.registerGroupId,
                                                  register.address,
                                                  { value: Number(e.target.value) }
                                                )
                                              }
                                              sx={{ width: '100%' }}
                                              inputProps={{
                                                style: { textAlign: 'center' },
                                                min: 0,
                                                max: 65535
                                              }}
                                              type="number"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <EditableCell
                                            value={register.comment}
                                            onChange={(value) =>
                                              updateRegister(
                                                tab.connectionId,
                                                tab.slaveId,
                                                tab.registerGroupId,
                                                register.address,
                                                { comment: value }
                                              )
                                            }
                                            placeholder="Add comment..."
                                          />
                                        </TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </TableContainer>
                            <TablePagination
                              component="div"
                              count={group.registers.length}
                              page={pagination.page}
                              onPageChange={(_, newPage) =>
                                setTablePagination({
                                  ...tablePagination,
                                  [paginationKey]: { ...pagination, page: newPage }
                                })
                              }
                              rowsPerPage={pagination.rowsPerPage}
                              onRowsPerPageChange={(e) =>
                                setTablePagination({
                                  ...tablePagination,
                                  [paginationKey]: {
                                    ...pagination,
                                    page: 0,
                                    rowsPerPage: parseInt(e.target.value, 10)
                                  }
                                })
                              }
                              rowsPerPageOptions={[25, 50, 100, 200, 500]}
                            />
                          </>
                        )
                      })()}
                    </Box>

                    {/* Bottom Edit Panel */}
                    <Paper
                      sx={{
                        borderTop: 1,
                        borderColor: 'divider',
                        maxHeight: '40%',
                        minHeight: 200,
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <Tabs
                        value={tab.interpretationTab}
                        onChange={(_, value) =>
                          updateTab(activeTabId, { interpretationTab: value })
                        }
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ borderBottom: 1, borderColor: 'divider' }}
                      >
                        <Tab label="Unsigned-Signed-Hex-Binary" value="basic" />
                        <Tab label="Long" value="long" />
                        <Tab label="Float" value="float" />
                        <Tab label="Double" value="double" />
                        <Tab label="String" value="string" />
                      </Tabs>

                      <Box sx={{ flex: 1, p: 2, overflow: 'auto' }}>
                        {tab.selectedAddresses.size === 0 ? (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: '100%'
                            }}
                          >
                            <Typography color="text.secondary">
                              Select registers to view/edit data interpretation
                            </Typography>
                          </Box>
                        ) : tab.interpretationTab === 'basic' ? (
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                              gap: 2
                            }}
                          >
                            {selectedRegisters.map((reg) => (
                              <Paper key={reg.address} variant="outlined" sx={{ p: 2 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                  {formatAddress(reg.address)}
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                  <TextField
                                    size="small"
                                    label="Signed"
                                    value={reg.value & 0x8000 ? reg.value - 65536 : reg.value}
                                    InputProps={{ readOnly: true }}
                                  />
                                  <TextField
                                    size="small"
                                    label="Unsigned"
                                    value={reg.value}
                                    InputProps={{ readOnly: true }}
                                  />
                                  <TextField
                                    size="small"
                                    label="Hex"
                                    value={formatAddress(reg.value)}
                                    InputProps={{ readOnly: true }}
                                  />
                                  <TextField
                                    size="small"
                                    label="Binary"
                                    value={reg.value.toString(2).padStart(16, '0')}
                                    InputProps={{ readOnly: true }}
                                  />
                                </Box>
                              </Paper>
                            ))}
                          </Box>
                        ) : tab.interpretationTab === 'long' ? (
                          longGroups.length > 0 ? (
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: 2
                              }}
                            >
                              {longGroups.map((pair, idx) => (
                                <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                                  <Typography variant="subtitle2" gutterBottom>
                                    {formatAddress(pair[0].address)} -{' '}
                                    {formatAddress(pair[1].address)}
                                  </Typography>
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {(['ABCD', 'CDAB', 'BADC', 'DCBA'] as const).map((order) => {
                                      const uint32 = registersToUint32(pair, order)
                                      return (
                                        <Box key={order} sx={{ display: 'flex', gap: 1 }}>
                                          <Typography
                                            variant="caption"
                                            sx={{ minWidth: 60, color: 'text.secondary' }}
                                          >
                                            {order}
                                          </Typography>
                                          <TextField
                                            size="small"
                                            value={uint32}
                                            fullWidth
                                            InputProps={{ readOnly: true }}
                                          />
                                        </Box>
                                      )
                                    })}
                                  </Box>
                                </Paper>
                              ))}
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%'
                              }}
                            >
                              <Typography color="text.secondary">
                                Select at least 2 consecutive registers to edit Long type
                              </Typography>
                            </Box>
                          )
                        ) : tab.interpretationTab === 'float' ? (
                          floatGroups.length > 0 ? (
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: 2
                              }}
                            >
                              {floatGroups.map((pair, idx) => (
                                <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                                  <Typography variant="subtitle2" gutterBottom>
                                    {formatAddress(pair[0].address)} -{' '}
                                    {formatAddress(pair[1].address)}
                                  </Typography>
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {(['ABCD', 'CDAB', 'BADC', 'DCBA'] as const).map((order) => (
                                      <Box key={order} sx={{ display: 'flex', gap: 1 }}>
                                        <Typography
                                          variant="caption"
                                          sx={{ minWidth: 60, color: 'text.secondary' }}
                                        >
                                          {order}
                                        </Typography>
                                        <TextField
                                          size="small"
                                          value={registersToFloat32(pair, order).toPrecision(7)}
                                          fullWidth
                                          InputProps={{ readOnly: true }}
                                        />
                                      </Box>
                                    ))}
                                  </Box>
                                </Paper>
                              ))}
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%'
                              }}
                            >
                              <Typography color="text.secondary">
                                Select at least 2 consecutive registers to edit Float type
                              </Typography>
                            </Box>
                          )
                        ) : tab.interpretationTab === 'double' ? (
                          doubleGroups.length > 0 ? (
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                gap: 2
                              }}
                            >
                              {doubleGroups.map((quad, idx) => (
                                <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                                  <Typography variant="subtitle2" gutterBottom>
                                    {formatAddress(quad[0].address)} -{' '}
                                    {formatAddress(quad[3].address)}
                                  </Typography>
                                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {(
                                      ['ABCDEFGH', 'GHEFCDAB', 'BADCFEHG', 'HGFEDCBA'] as const
                                    ).map((order) => (
                                      <Box key={order} sx={{ display: 'flex', gap: 1 }}>
                                        <Typography
                                          variant="caption"
                                          sx={{ minWidth: 100, color: 'text.secondary' }}
                                        >
                                          {order}
                                        </Typography>
                                        <TextField
                                          size="small"
                                          value={registersToFloat64(quad, order).toPrecision(15)}
                                          fullWidth
                                          InputProps={{ readOnly: true }}
                                        />
                                      </Box>
                                    ))}
                                  </Box>
                                </Paper>
                              ))}
                            </Box>
                          ) : (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%'
                              }}
                            >
                              <Typography color="text.secondary">
                                Select at least 4 consecutive registers to edit Double type
                              </Typography>
                            </Box>
                          )
                        ) : tab.interpretationTab === 'string' ? (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                              <Typography variant="subtitle2">String Encoding:</Typography>
                              <Select
                                value={tab.stringEncoding}
                                onChange={(e) =>
                                  updateTab(activeTabId, {
                                    stringEncoding: e.target.value as string
                                  })
                                }
                                size="small"
                                sx={{ minWidth: 150 }}
                              >
                                {ENCODING_OPTIONS.map((enc) => (
                                  <MenuItem key={enc} value={enc}>
                                    {enc}
                                  </MenuItem>
                                ))}
                              </Select>
                            </Box>
                            <TextField
                              multiline
                              rows={3}
                              value={selectedRegisters
                                .map((r) =>
                                  String.fromCharCode(r.value & 0xff, (r.value >> 8) & 0xff)
                                )
                                .join('')}
                              fullWidth
                              variant="outlined"
                            />
                          </Box>
                        ) : null}
                      </Box>
                    </Paper>
                  </Box>
                )
              })()
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%'
                }}
              >
                <Typography color="text.secondary">
                  Double-click a register group to open
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <NewConnectionDialog
        open={newConnectionOpen}
        onClose={() => setNewConnectionOpen(false)}
        onConfirm={handleNewConnection}
      />
      <NewSlaveDialog
        open={newSlaveOpen}
        onClose={() => setNewSlaveOpen(false)}
        onConfirm={handleNewSlave}
      />
      <NewConnectionDialog
        open={editConnectionOpen}
        onClose={() => {
          setEditConnectionOpen(false)
          setEditingConnection(undefined)
        }}
        onConfirm={handleSaveEditedConnection}
        initialConnection={editingConnection}
      />
      <NewSlaveDialog
        open={editSlaveOpen}
        onClose={() => {
          setEditSlaveOpen(false)
          setEditingSlave(undefined)
          setEditingSlaveConnectionId(null)
        }}
        onConfirm={handleSaveEditedSlave}
        initialSlave={editingSlave}
      />
    </Box>
  )
}

export default Server
