import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useTransition,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { useTranslation } from 'react-i18next'
import { onEvent, sendEvent } from '@renderer/events'
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
  Menu,
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
import { alpha } from '@mui/material/styles'
import { useSnackbar } from 'notistack'
import {
  Add as AddIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  DeviceHub as DeviceIcon,
  Link as LinkIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Circle as CircleIcon,
  ToggleOn as CoilIcon,
  ToggleOff as DiscreteInputIcon,
  Storage as HoldingRegisterIcon,
  Input as InputRegisterIcon,
  Refresh as RefreshIcon,
  ShowChart as ShowChartIcon,
  DashboardCustomize as WorkspaceMenuIcon,
  Cable as ConnectionMenuIcon,
  Construction as ToolsMenuIcon
} from '@mui/icons-material'
import { v4 as uuidv4 } from 'uuid'
import SettingsMenu from '@renderer/components/shared/SettingsMenu'
import {
  GLOBAL_PREFERENCE_CHANGE_EVENT,
  GLOBAL_STRING_ENCODING_KEY,
  GLOBAL_STRING_ENCODING_OPTIONS,
  type GlobalPreferenceChangeDetail,
  getGlobalStringEncodingPreference,
  setGlobalStringEncodingPreference
} from '@renderer/settings/global-preferences'
import type {
  CreateServerParams,
  PlotInterpretation,
  RegisterParams,
  RegisterPlotWindowInit,
  ServerConnectionConfig,
  UnitIdString
} from '@shared'
import {
  canSelectInterpretationAtAddress,
  getBatchAssignableAddresses,
  getWordSpanForInterpretation
} from './register-plot.helpers'
import { buildWorkspaceTabSettingsSnapshot } from './server-workspace.helpers'
import { getWorkspaceDirtyState } from './server-unsaved-guard.helpers'

// =============================================================================
// TYPES
// =============================================================================

interface Register {
  address: number
  value: number
  variableName: string
  comment: string
  displayFormat?: RegisterDisplayFormat
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
  invalidRequestBehavior?: 'silent' | 'exception'
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

interface ScriptDefinition {
  id: string
  name: string
  enabled: boolean
  intervalMs: number
  code: string
  lastError?: string
  lastRunAt?: number
}

interface ScriptRuntimeApi {
  getValue: (unitId: number, registerType: RegisterGroup['type'], address: number) => number | undefined
  setValue: (
    unitId: number,
    registerType: RegisterGroup['type'],
    address: number,
    value: number
  ) => boolean
  setValues: (
    unitId: number,
    registerType: RegisterGroup['type'],
    values: Record<number, number>
  ) => number
  log: (...args: unknown[]) => void
}

interface ScriptRuntimeEvent {
  type: 'manual' | 'interval'
  timestamp: number
}

const toServerConfig = (connection: Connection): ServerConnectionConfig => {
  const invalidRequestBehavior = connection.invalidRequestBehavior ?? 'silent'
  switch (connection.mode) {
    case 'tcp':
      return {
        protocol: 'ModbusTcp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502,
        invalidRequestBehavior
      }
    case 'udp':
      return {
        protocol: 'ModbusUdp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502,
        invalidRequestBehavior
      }
    case 'rtuovertcp':
      return {
        protocol: 'ModbusRtuOverTcp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502,
        invalidRequestBehavior
      }
    case 'rtuoverudp':
      return {
        protocol: 'ModbusRtuOverUdp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502,
        invalidRequestBehavior
      }
    case 'rtu':
    default:
      return {
        protocol: connection.frameFormat === 'ascii' ? 'ModbusAscii' : 'ModbusRtu',
        invalidRequestBehavior,
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
  interpretationTab: 'basic' | 'long' | 'float' | 'double' | 'typed' | 'string'
  stringEncoding: string
  typedInterpretation: Record<number, PlotInterpretation>
  registerDisplayFormat: Record<number, RegisterDisplayFormat>
}

interface PlotWindowState extends RegisterPlotWindowInit {
  selectionColor: string
}

interface WorkspaceTabSettings {
  interpretationTab: OpenTab['interpretationTab']
  stringEncoding: string
  typedInterpretation: Record<number, PlotInterpretation>
  registerDisplayFormat: Record<number, RegisterDisplayFormat>
}

interface WorkspaceFileHandle {
  name?: string
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>
    close: () => Promise<void>
  }>
}

interface PersistedWorkspaceSnapshot {
  version: number
  connections: Connection[]
  tabSettings?: Record<string, WorkspaceTabSettings>
  scriptsByConnection?: Record<string, ScriptDefinition[]>
  openTabs?: Array<{
    connectionId: string
    slaveId: string
    registerGroupId: string
  }>
  activeTabId?: string | null
}

interface RecentWorkspaceEntry {
  id: string
  name: string
  path: string
  updatedAt: number
}

interface TypedValueEditMenuState {
  tabId: string
  address: number
  mouseX: number
  mouseY: number
}

interface TypedBatchMenuState {
  tabId: string
  mouseX: number
  mouseY: number
}

interface DisplayFormatEditMenuState {
  tabId: string
  address: number
  mouseX: number
  mouseY: number
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TYPED_INTERPRETATION_OPTIONS: PlotInterpretation[] = [
  'short',
  'ushort',
  'int',
  'uint',
  'long',
  'ulong',
  'float',
  'double'
]

type RegisterDisplayFormat =
  | 'dec'
  | 'hex'
  | 'bin'
  | 'oct'

const DISPLAY_FORMAT_OPTIONS: Array<{ mode: RegisterDisplayFormat; label: string; words: number }> = [
  { mode: 'dec', label: 'DEC', words: 1 },
  { mode: 'hex', label: 'HEX', words: 1 },
  { mode: 'bin', label: 'BIN', words: 1 },
  { mode: 'oct', label: 'OCT', words: 1 }
]

interface TypedSpanHint {
  startAddress: number
  span: number
  mode: PlotInterpretation
  index: number
}

type TableColumnKey =
  | 'interpretation'
  | 'display'
  | 'address'
  | 'variable'
  | 'value'
  | 'comments'

const DEFAULT_TABLE_COLUMN_WIDTHS: Record<TableColumnKey, number> = {
  interpretation: 150,
  display: 130,
  address: 104,
  variable: 220,
  value: 120,
  comments: 260
}

const MIN_TABLE_COLUMN_WIDTHS: Record<TableColumnKey, number> = {
  interpretation: 130,
  display: 110,
  address: 88,
  variable: 140,
  value: 88,
  comments: 150
}

const SERVER_LAYOUT_STORAGE_KEY = 'modbux.server.layout.v1'
const MONO_FONT_FAMILY = 'var(--modbux-mono-font, "Iosevka", "Cascadia Mono", "Consolas", monospace)'
const MONO_FONT_SIZE = 'var(--modbux-mono-font-size, 13px)'
const DEFAULT_LEFT_PANEL_WIDTH = 320
const DEFAULT_BOTTOM_PANEL_HEIGHT = 300
const MIN_LEFT_PANEL_WIDTH = 240
const MIN_RIGHT_PANEL_WIDTH = 560
const MIN_BOTTOM_PANEL_HEIGHT = 180
const MIN_TOP_PANEL_HEIGHT = 220
const DEFAULT_WORKSPACE_FILENAME_PREFIX = 'modbux_workspace'
const RECENT_WORKSPACES_STORAGE_KEY = 'modbux.server.recentWorkspaces.v1'
const LAST_WORKSPACE_ID_STORAGE_KEY = 'modbux.server.lastWorkspaceId.v1'
const MAX_RECENT_WORKSPACES = 8
const WINDOW_TITLEBAR_PADDING_TOP = 'calc(env(titlebar-area-height, 0px) + 6px)'
const TOP_MENU_BUTTON_SX = {
  borderRadius: 999,
  px: 1.25,
  py: 0.45,
  textTransform: 'none',
  fontWeight: 600,
  letterSpacing: 0.1,
  border: '1px solid',
  borderColor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.35)' : '#94a3b8'),
  color: (theme) => (theme.palette.mode === 'dark' ? '#e2e8f0' : '#0f172a'),
  bgcolor: (theme) =>
    theme.palette.mode === 'dark' ? 'rgba(15,23,42,0.58)' : 'rgba(255,255,255,0.96)',
  backdropFilter: 'blur(8px)',
  boxShadow: (theme) =>
    theme.palette.mode === 'dark'
      ? '0 6px 16px rgba(15,23,42,0.24)'
      : '0 6px 14px rgba(15,23,42,0.14)',
  WebkitAppRegion: 'no-drag',
  '&:hover': {
    borderColor: (theme) => (theme.palette.mode === 'dark' ? '#60a5fa' : '#2563eb'),
    color: (theme) => (theme.palette.mode === 'dark' ? '#bfdbfe' : '#1d4ed8'),
    bgcolor: (theme) =>
      theme.palette.mode === 'dark' ? 'rgba(30,58,138,0.26)' : 'rgba(226,232,240,0.98)',
    boxShadow: (theme) =>
      theme.palette.mode === 'dark'
        ? '0 8px 18px rgba(37,99,235,0.32)'
        : '0 8px 18px rgba(37,99,235,0.18)'
  }
} as const

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const toUnitIdString = (slaveId: number): UnitIdString => String(slaveId) as UnitIdString

const getBackendBoolRegisterType = (
  type: RegisterGroup['type']
): 'coils' | 'discrete_inputs' | undefined => {
  if (type === '01') return 'coils'
  if (type === '02') return 'discrete_inputs'
  return undefined
}

const getBackendNumberRegisterType = (
  type: RegisterGroup['type']
): 'holding_registers' | 'input_registers' | undefined => {
  if (type === '03') return 'holding_registers'
  if (type === '04') return 'input_registers'
  return undefined
}

const toStaticRegisterParams = (
  register: Register,
  registerType: 'holding_registers' | 'input_registers'
): RegisterParams => ({
  address: register.address,
  registerType,
  dataType: 'uint16',
  comment: register.comment || '',
  value: clamp(Math.round(register.value), 0, 65535),
  min: undefined,
  max: undefined,
  interval: undefined
})

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

const getDefaultTypedInterpretation = (registerType: RegisterGroup['type']): PlotInterpretation => {
  return registerType === '01' || registerType === '02' ? 'ushort' : 'short'
}

const buildTypedSpanHints = (
  selectedAddresses: Set<number>,
  typedInterpretation: Record<number, PlotInterpretation>
): Map<number, TypedSpanHint> => {
  const hints = new Map<number, TypedSpanHint>()
  const starts = Object.keys(typedInterpretation)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  starts.forEach((startAddress) => {
    const mode = typedInterpretation[startAddress]
    if (!mode) return
    const span = getWordSpanForInterpretation(mode)
    if (span <= 1) return
    for (let i = 0; i < span; i++) {
      if (!selectedAddresses.has(startAddress + i)) {
        return
      }
    }
    for (let i = 1; i < span; i++) {
      const innerMode = typedInterpretation[startAddress + i]
      if (innerMode && innerMode !== mode) {
        return
      }
    }
    for (let i = 0; i < span; i++) {
      hints.set(startAddress + i, {
        startAddress,
        span,
        mode,
        index: i
      })
    }
  })

  return hints
}

const getDisplayWordSpan = (mode: RegisterDisplayFormat): number => {
  const config = DISPLAY_FORMAT_OPTIONS.find((option) => option.mode === mode)
  return config?.words || 1
}

const formatDisplayValue = (
  rawRegisters: Record<number, number>,
  address: number,
  mode: RegisterDisplayFormat
): string => {
  const word = rawRegisters[address] ?? 0
  switch (mode) {
    case 'dec':
      return String(word & 0xffff)
    case 'hex':
      return `0x${(word & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`
    case 'bin':
      return `0b${(word & 0xffff).toString(2).padStart(16, '0')}`
    case 'oct':
      return `0o${(word & 0xffff).toString(8)}`
    default:
      return String(word & 0xffff)
  }
}

const parseDisplayInputToRawRegister = (
  input: string,
  mode: RegisterDisplayFormat
): number | null => {
  if (mode === 'dec') {
    const value = Number(input)
    if (!Number.isFinite(value)) return null
    return Math.max(0, Math.min(65535, Math.round(value)))
  }

  if (mode === 'hex') {
    const normalized = input.trim().replace(/^0x/i, '')
    if (!/^[0-9a-fA-F]{1,4}$/.test(normalized)) return null
    return parseInt(normalized, 16) & 0xffff
  }

  if (mode === 'bin') {
    const normalized = input.trim().replace(/^0b/i, '')
    if (!/^[01]{1,16}$/.test(normalized)) return null
    return parseInt(normalized, 2) & 0xffff
  }

  if (mode === 'oct') {
    const normalized = input.trim().replace(/^0o/i, '')
    if (!/^[0-7]{1,6}$/.test(normalized)) return null
    return parseInt(normalized, 8) & 0xffff
  }

  return null
}

const parseAutoRadixRegisterInput = (input: string): number | null => {
  const normalized = input.trim()
  if (!normalized) return null

  if (/^0x/i.test(normalized)) return parseDisplayInputToRawRegister(normalized, 'hex')
  if (/^0b/i.test(normalized)) return parseDisplayInputToRawRegister(normalized, 'bin')
  if (/^0o/i.test(normalized)) return parseDisplayInputToRawRegister(normalized, 'oct')

  if (!/^[+-]?\d+$/.test(normalized)) return null
  const value = Number.parseInt(normalized, 10)
  if (!Number.isFinite(value) || value < 0 || value > 65535) return null
  return value
}

const INTERPRETATION_COLORS: Record<
  PlotInterpretation,
  { bg: string; fg: string; border: string }
> = {
  short: { bg: '#e3f2fd', fg: '#0d47a1', border: '#90caf9' },
  ushort: { bg: '#e8f5e9', fg: '#1b5e20', border: '#a5d6a7' },
  int: { bg: '#f3e5f5', fg: '#4a148c', border: '#ce93d8' },
  uint: { bg: '#fff3e0', fg: '#e65100', border: '#ffcc80' },
  long: { bg: '#ede7f6', fg: '#311b92', border: '#b39ddb' },
  ulong: { bg: '#e0f2f1', fg: '#004d40', border: '#80cbc4' },
  float: { bg: '#fce4ec', fg: '#880e4f', border: '#f48fb1' },
  double: { bg: '#f1f8e9', fg: '#33691e', border: '#c5e1a5' }
}

const DISPLAY_COLORS: Record<
  RegisterDisplayFormat,
  { bg: string; fg: string; border: string }
> = {
  dec: { bg: '#e8f5e9', fg: '#1b5e20', border: '#a5d6a7' },
  hex: { bg: '#ede7f6', fg: '#311b92', border: '#b39ddb' },
  bin: { bg: '#e3f2fd', fg: '#0d47a1', border: '#90caf9' },
  oct: { bg: '#fff3e0', fg: '#e65100', border: '#ffcc80' }
}

const PLOT_SERIES_COLORS = ['#0B57D0', '#B3261E', '#2E7D32', '#ED6C02', '#8E24AA', '#00897B', '#6D4C41', '#546E7A']
const PLOT_SELECTION_COLORS = ['#90caf9', '#ffab91', '#a5d6a7', '#ce93d8', '#ffe082', '#80cbc4']

const getPlotSelectionColor = (index: number): string =>
  PLOT_SELECTION_COLORS[index % PLOT_SELECTION_COLORS.length]

type BasicValueFormat = 'signed' | 'unsigned' | 'hex' | 'bin' | 'oct'

const formatBasicValue = (raw: number, format: BasicValueFormat): string => {
  const word = raw & 0xffff
  if (format === 'signed') return String(word > 0x7fff ? word - 0x10000 : word)
  if (format === 'unsigned') return String(word)
  if (format === 'hex') return `0x${word.toString(16).toUpperCase().padStart(4, '0')}`
  if (format === 'bin') return `0b${word.toString(2).padStart(16, '0')}`
  return `0o${word.toString(8)}`
}

const parseBasicValueInput = (input: string, format: BasicValueFormat): number | null => {
  if (format === 'signed') {
    const value = Number(input)
    if (!Number.isFinite(value)) return null
    if (value < -32768 || value > 32767) return null
    const rounded = Math.round(value)
    return rounded < 0 ? rounded + 0x10000 : rounded
  }

  if (format === 'unsigned') {
    const value = Number(input)
    if (!Number.isFinite(value)) return null
    if (value < 0 || value > 65535) return null
    return Math.round(value)
  }

  if (format === 'hex') return parseDisplayInputToRawRegister(input, 'hex')
  if (format === 'bin') return parseDisplayInputToRawRegister(input, 'bin')
  return parseDisplayInputToRawRegister(input, 'oct')
}

const parseCoilBitInput = (
  input: string,
  format: 'unsigned' | 'hex' | 'bin' | 'oct'
): 0 | 1 | null => {
  const raw =
    format === 'unsigned'
      ? Number(input)
      : format === 'hex'
        ? parseDisplayInputToRawRegister(input, 'hex')
        : format === 'bin'
          ? parseDisplayInputToRawRegister(input, 'bin')
          : parseDisplayInputToRawRegister(input, 'oct')
  if (raw === null) return null
  if (raw !== 0 && raw !== 1) return null
  return raw as 0 | 1
}

const uint32ToRegisters = (
  value: number,
  order: 'ABCD' | 'CDAB' | 'BADC' | 'DCBA'
): [number, number] => {
  const v = value >>> 0
  const bytes = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]
  const arranged =
    order === 'ABCD'
      ? bytes
      : order === 'CDAB'
        ? [bytes[2], bytes[3], bytes[0], bytes[1]]
        : order === 'BADC'
          ? [bytes[1], bytes[0], bytes[3], bytes[2]]
          : [bytes[3], bytes[2], bytes[1], bytes[0]]
  return [((arranged[0] & 0xff) << 8) | (arranged[1] & 0xff), ((arranged[2] & 0xff) << 8) | (arranged[3] & 0xff)]
}

const float32ToRegisters = (
  value: number,
  order: 'ABCD' | 'CDAB' | 'BADC' | 'DCBA'
): [number, number] => {
  const buf = new ArrayBuffer(4)
  const view = new DataView(buf)
  view.setFloat32(0, value, false)
  const u32 = view.getUint32(0, false)
  return uint32ToRegisters(u32, order)
}

const float64ToRegisters = (
  value: number,
  order: 'ABCDEFGH' | 'GHEFCDAB' | 'BADCFEHG' | 'HGFEDCBA'
): [number, number, number, number] => {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setFloat64(0, value, false)
  const bytes = Array.from({ length: 8 }, (_, i) => view.getUint8(i))
  const arranged =
    order === 'ABCDEFGH'
      ? bytes
      : order === 'GHEFCDAB'
        ? [bytes[6], bytes[7], bytes[4], bytes[5], bytes[2], bytes[3], bytes[0], bytes[1]]
        : order === 'BADCFEHG'
          ? [bytes[1], bytes[0], bytes[3], bytes[2], bytes[5], bytes[4], bytes[7], bytes[6]]
          : [bytes[7], bytes[6], bytes[5], bytes[4], bytes[3], bytes[2], bytes[1], bytes[0]]
  return [
    ((arranged[0] & 0xff) << 8) | (arranged[1] & 0xff),
    ((arranged[2] & 0xff) << 8) | (arranged[3] & 0xff),
    ((arranged[4] & 0xff) << 8) | (arranged[5] & 0xff),
    ((arranged[6] & 0xff) << 8) | (arranged[7] & 0xff)
  ]
}

interface CoilConversionGroup {
  startBit: number
  endBit: number
  words: [number, number] | [number, number, number, number]
}

const buildCoilConversionGroups = (
  registers: Register[],
  bitsPerGroup: 32 | 64
): CoilConversionGroup[] => {
  const sorted = [...registers].sort((a, b) => a.address - b.address)
  if (sorted.length === 0) return []

  const groups: CoilConversionGroup[] = []
  let segmentStart = 0
  const wordsPerGroup = bitsPerGroup / 16

  const flushSegment = (endExclusive: number): void => {
    const segment = sorted.slice(segmentStart, endExclusive)
    const fullGroups = Math.floor(segment.length / bitsPerGroup)
    for (let groupIndex = 0; groupIndex < fullGroups; groupIndex++) {
      const from = groupIndex * bitsPerGroup
      const to = from + bitsPerGroup
      const bits = segment.slice(from, to)
      if (bits.length !== bitsPerGroup) continue

      const words: number[] = []
      for (let wordIndex = 0; wordIndex < wordsPerGroup; wordIndex++) {
        const bitStart = wordIndex * 16
        let byteHigh = 0
        let byteLow = 0
        for (let i = 0; i < 8; i++) {
          if ((bits[bitStart + i]?.value ?? 0) !== 0) byteHigh |= 1 << i
          if ((bits[bitStart + 8 + i]?.value ?? 0) !== 0) byteLow |= 1 << i
        }
        words.push(((byteHigh & 0xff) << 8) | (byteLow & 0xff))
      }

      groups.push({
        startBit: bits[0].address,
        endBit: bits[bits.length - 1].address,
        words:
          wordsPerGroup === 2
            ? ([words[0], words[1]] as [number, number])
            : ([words[0], words[1], words[2], words[3]] as [number, number, number, number])
      })
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].address !== sorted[i - 1].address + 1) {
      flushSegment(i)
      segmentStart = i
    }
  }
  flushSegment(sorted.length)
  return groups
}

const wordsToCoilBitMap = (startBit: number, words: number[]): Record<number, number> => {
  const updates: Record<number, number> = {}
  words.forEach((word, wordIndex) => {
    const high = (word >> 8) & 0xff
    const low = word & 0xff
    const base = startBit + wordIndex * 16
    for (let i = 0; i < 8; i++) {
      updates[base + i] = (high >> i) & 0x01
      updates[base + 8 + i] = (low >> i) & 0x01
    }
  })
  return updates
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
  const [invalidRequestBehavior, setInvalidRequestBehavior] = useState<'silent' | 'exception'>(
    initialConnection?.invalidRequestBehavior || 'silent'
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
      setInvalidRequestBehavior(initialConnection?.invalidRequestBehavior || 'silent')
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
      invalidRequestBehavior,
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
          <FormControl fullWidth variant="outlined">
            <InputLabel size="small">Invalid Request Handling</InputLabel>
            <Select
              value={invalidRequestBehavior}
              onChange={(e) =>
                setInvalidRequestBehavior(e.target.value as 'silent' | 'exception')
              }
              label="Invalid Request Handling"
              size="small"
            >
              <MenuItem value="silent">Silent (no response)</MenuItem>
              <MenuItem value="exception">Modbus Exception</MenuItem>
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
                  alignItems: 'flex-start',
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
        minHeight: '20px',
        display: 'flex',
        alignItems: 'center',
        color: value ? 'text.primary' : 'text.disabled'
      }}
    >
      {value || placeholder || '(双击编辑)'}
    </Typography>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const Server = (): JSX.Element => {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const [connections, setConnections] = useState<Connection[]>([])
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set())
  const [expandedSlaves, setExpandedSlaves] = useState<Set<string>>(new Set())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [workspaceTabSettings, setWorkspaceTabSettings] = useState<
    Record<string, WorkspaceTabSettings>
  >({})
  const [workspaceFileHandle, setWorkspaceFileHandle] = useState<WorkspaceFileHandle | null>(null)
  const [workspaceFilename, setWorkspaceFilename] = useState<string | null>(null)
  const [workspaceFilePath, setWorkspaceFilePath] = useState<string | null>(null)
  const [workspaceSavedFingerprint, setWorkspaceSavedFingerprint] = useState<string | null>(null)
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspaceEntry[]>([])
  const [workspaceMenuAnchorEl, setWorkspaceMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [connectionMenuAnchorEl, setConnectionMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [toolsMenuAnchorEl, setToolsMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [globalEncoding, setGlobalEncoding] = useState<string>(getGlobalStringEncodingPreference)
  const [scriptsByConnection, setScriptsByConnection] = useState<Record<string, ScriptDefinition[]>>(
    {}
  )
  const scriptStateMapRef = useRef<Record<string, Record<string, unknown>>>({})
  const scriptTimerMapRef = useRef<
    Record<string, { timer: ReturnType<typeof setInterval>; intervalMs: number }>
  >({})
  const workspaceInitialFingerprintRef = useRef<string | null>(null)
  const connectionsRef = useRef<Connection[]>([])
  const unsavedConfirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null)
  const unsavedConfirmPromiseRef = useRef<Promise<boolean> | null>(null)
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false)

  const [newConnectionOpen, setNewConnectionOpen] = useState(false)
  const [newSlaveOpen, setNewSlaveOpen] = useState(false)
  const [selectedConnectionForSlave, setSelectedConnectionForSlave] = useState<string | null>(null)
  const lastSelectedAddressRef = useRef<number | null>(null)
  const [editConnectionOpen, setEditConnectionOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | undefined>(undefined)
  const [editSlaveOpen, setEditSlaveOpen] = useState(false)
  const [editingSlave, setEditingSlave] = useState<Slave | undefined>(undefined)
  const [editingSlaveConnectionId, setEditingSlaveConnectionId] = useState<string | null>(null)
  const [typedBatchMode, setTypedBatchMode] = useState<PlotInterpretation>('short')
  const [displayBatchMode, setDisplayBatchMode] = useState<RegisterDisplayFormat>('dec')
  const [basicEditCell, setBasicEditCell] = useState<{
    address: number
    format: BasicValueFormat
    draft: string
    hasError: boolean
  } | null>(null)
  const [inlineValueEditCell, setInlineValueEditCell] = useState<{
    tabId: string
    address: number
    draft: string
    hasError: boolean
  } | null>(null)
  const [conversionEditCell, setConversionEditCell] = useState<{
    tab: 'long' | 'float' | 'double'
    start: number
    order: string
    draft: string
    hasError: boolean
  } | null>(null)
  const [typedValueEditMenu, setTypedValueEditMenu] = useState<TypedValueEditMenuState | null>(null)
  const [typedBatchMenu, setTypedBatchMenu] = useState<TypedBatchMenuState | null>(null)
  const [typedRowTypeMenu, setTypedRowTypeMenu] = useState<{
    anchorEl: HTMLElement | null
    address: number | null
  }>({ anchorEl: null, address: null })
  const [displayFormatEditMenu, setDisplayFormatEditMenu] =
    useState<DisplayFormatEditMenuState | null>(null)

  const [tablePagination, setTablePagination] = useState<
    Record<string, { page: number; rowsPerPage: number }>
  >({})
  const [bottomPanelPagination, setBottomPanelPagination] = useState<
    Record<string, { page: number; rowsPerPage: number }>
  >({})
  const [tableColumnWidths, setTableColumnWidths] = useState<
    Record<string, Partial<Record<TableColumnKey, number>>>
  >({})
  const [columnResizeState, setColumnResizeState] = useState<{
    tabId: string
    column: TableColumnKey
    startX: number
    startWidth: number
  } | null>(null)
  const mainSplitRef = useRef<HTMLDivElement | null>(null)
  const rightPanelRef = useRef<HTMLDivElement | null>(null)
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SERVER_LAYOUT_STORAGE_KEY)
      if (!saved) return DEFAULT_LEFT_PANEL_WIDTH
      const parsed = JSON.parse(saved) as { leftPanelWidth?: number }
      if (typeof parsed.leftPanelWidth !== 'number') return DEFAULT_LEFT_PANEL_WIDTH
      return clamp(parsed.leftPanelWidth, MIN_LEFT_PANEL_WIDTH, 640)
    } catch {
      return DEFAULT_LEFT_PANEL_WIDTH
    }
  })
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SERVER_LAYOUT_STORAGE_KEY)
      if (!saved) return DEFAULT_BOTTOM_PANEL_HEIGHT
      const parsed = JSON.parse(saved) as { bottomPanelHeight?: number }
      if (typeof parsed.bottomPanelHeight !== 'number') return DEFAULT_BOTTOM_PANEL_HEIGHT
      return clamp(parsed.bottomPanelHeight, MIN_BOTTOM_PANEL_HEIGHT, 560)
    } catch {
      return DEFAULT_BOTTOM_PANEL_HEIGHT
    }
  })
  const [layoutResizeState, setLayoutResizeState] = useState<
    | {
        type: 'left'
        startX: number
        startWidth: number
      }
    | {
        type: 'bottom'
        startY: number
        startHeight: number
      }
    | null
  >(null)
  const [, startTableTransition] = useTransition()
  const [plotWindows, setPlotWindows] = useState<PlotWindowState[]>([])

  const getTabId = (connectionId: string, slaveId: string, registerGroupId: string): string =>
    `${connectionId}-${slaveId}-${registerGroupId}`

  const showUserError = (message: string): void => {
    enqueueSnackbar({ variant: 'error', message })
  }

  useEffect(() => {
    connectionsRef.current = connections
  }, [connections])

  useEffect(() => {
    const recents = loadRecentWorkspacesFromStorage()
    setRecentWorkspaces(recents)

    const lastId = localStorage.getItem(LAST_WORKSPACE_ID_STORAGE_KEY)
    if (!lastId) return
    const lastWorkspace = recents.find((entry) => entry.id === lastId)
    if (!lastWorkspace) return
    void openWorkspaceByPath(lastWorkspace.path, {
      fallbackName: lastWorkspace.name,
      removeOnError: true,
      setAsLast: false
    })
  }, [])

  useEffect(() => {
    const persistLastSession = () => {
      if (connectionsRef.current.length === 0 || !workspaceFilePath) {
        markLastWorkspaceId(null)
        return
      }
      upsertRecentWorkspaceByPath(
        workspaceFilePath,
        workspaceFilename || workspaceFilePath.split(/[\\/]/).pop() || 'Workspace',
        { setAsLast: true }
      )
    }

    window.addEventListener('beforeunload', persistLastSession)
    return () => {
      window.removeEventListener('beforeunload', persistLastSession)
    }
  }, [workspaceFilename, workspaceFilePath, recentWorkspaces, connections])

  const syncSlaveToBackend = async (connectionId: string, slave: Slave): Promise<void> => {
    const unitId = toUnitIdString(slave.slaveId)
    const coils = new Array<boolean>(65535)
    const discreteInputs = new Array<boolean>(65535)
    const registerValues: RegisterParams[] = []

    slave.registerGroups.forEach((group) => {
      const boolType = getBackendBoolRegisterType(group.type)
      if (boolType) {
        group.registers.forEach((register) => {
          if (register.address < 0 || register.address >= 65535) return
          if (boolType === 'coils') coils[register.address] = register.value !== 0
          else discreteInputs[register.address] = register.value !== 0
        })
        return
      }

      const numberType = getBackendNumberRegisterType(group.type)
      if (!numberType) return
      group.registers.forEach((register) => {
        if (register.address < 0 || register.address >= 65535) return
        registerValues.push(toStaticRegisterParams(register, numberType))
      })
    })

    await window.api.syncBools({
      uuid: connectionId,
      unitId,
      coils,
      discrete_inputs: discreteInputs
    })

    await window.api.syncServerRegister({
      uuid: connectionId,
      unitId,
      registerValues,
      littleEndian: false
    })
  }

  const syncConnectionToBackend = async (connection: Connection): Promise<void> => {
    for (const slave of connection.slaves) {
      await syncSlaveToBackend(connection.id, slave)
    }
  }

  useEffect(() => {
    const offPlotClose = onEvent('register_plot_window_closed', (chartId) => {
      setPlotWindows((prev) => prev.filter((p) => p.chartId !== chartId))
    })

    return () => {
      offPlotClose()
    }
  }, [])

  useEffect(() => {
    if (plotWindows.length === 0) return

    const timer = setInterval(() => {
      const now = Date.now()
      plotWindows.forEach((plotWindow) => {
        const connection = connections.find((c) => c.id === plotWindow.connectionId)
        const slave = connection?.slaves.find((s) => s.id === plotWindow.slaveId)
        const group = slave?.registerGroups.find((g) => g.id === plotWindow.registerGroupId)
        if (!group) return

        const rawRegisters = Object.fromEntries(group.registers.map((reg) => [reg.address, reg.value]))
        sendEvent('register_plot_data', {
          chartId: plotWindow.chartId,
          timestamp: now,
          rawRegisters
        })
      })
    }, 500)

    return () => {
      clearInterval(timer)
    }
  }, [connections, plotWindows])

  useEffect(() => {
    if (!columnResizeState) return

    const onMouseMove = (event: MouseEvent): void => {
      const deltaX = event.clientX - columnResizeState.startX
      const nextWidth = Math.max(
        MIN_TABLE_COLUMN_WIDTHS[columnResizeState.column],
        Math.round(columnResizeState.startWidth + deltaX)
      )
      setTableColumnWidths((prev) => ({
        ...prev,
        [columnResizeState.tabId]: {
          ...prev[columnResizeState.tabId],
          [columnResizeState.column]: nextWidth
        }
      }))
    }

    const onMouseUp = (): void => {
      setColumnResizeState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [columnResizeState])

  useEffect(() => {
    setBasicEditCell(null)
    setConversionEditCell(null)
  }, [activeTabId])

  useEffect(() => {
    if (openTabs.length === 0) return
    setWorkspaceTabSettings((prev) => {
      const next = { ...prev }
      openTabs.forEach((tab) => {
        const tabId = getTabId(tab.connectionId, tab.slaveId, tab.registerGroupId)
        next[tabId] = {
          interpretationTab: tab.interpretationTab,
          stringEncoding: tab.stringEncoding,
          typedInterpretation: tab.typedInterpretation,
          registerDisplayFormat: tab.registerDisplayFormat
        }
      })
      return next
    })
  }, [openTabs])

  useEffect(() => {
    const saved = {
      leftPanelWidth,
      bottomPanelHeight
    }
    localStorage.setItem(SERVER_LAYOUT_STORAGE_KEY, JSON.stringify(saved))
  }, [leftPanelWidth, bottomPanelHeight])

  useEffect(() => {
    if (!layoutResizeState) return

    const onMouseMove = (event: MouseEvent): void => {
      if (layoutResizeState.type === 'left') {
        const containerWidth = mainSplitRef.current?.clientWidth || window.innerWidth
        const max = Math.max(MIN_LEFT_PANEL_WIDTH, containerWidth - MIN_RIGHT_PANEL_WIDTH)
        const delta = event.clientX - layoutResizeState.startX
        setLeftPanelWidth(clamp(layoutResizeState.startWidth + delta, MIN_LEFT_PANEL_WIDTH, max))
        return
      }

      const rightHeight = rightPanelRef.current?.clientHeight || window.innerHeight
      const max = Math.max(MIN_BOTTOM_PANEL_HEIGHT, rightHeight - MIN_TOP_PANEL_HEIGHT)
      const delta = layoutResizeState.startY - event.clientY
      setBottomPanelHeight(
        clamp(layoutResizeState.startHeight + delta, MIN_BOTTOM_PANEL_HEIGHT, max)
      )
    }

    const onMouseUp = (): void => {
      setLayoutResizeState(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = layoutResizeState.type === 'left' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [layoutResizeState])

  useEffect(() => {
    const syncLayoutBounds = (): void => {
      const containerWidth = mainSplitRef.current?.clientWidth
      if (containerWidth) {
        const maxLeft = Math.max(MIN_LEFT_PANEL_WIDTH, containerWidth - MIN_RIGHT_PANEL_WIDTH)
        setLeftPanelWidth((prev) => clamp(prev, MIN_LEFT_PANEL_WIDTH, maxLeft))
      }

      const rightHeight = rightPanelRef.current?.clientHeight
      if (rightHeight) {
        const maxBottom = Math.max(MIN_BOTTOM_PANEL_HEIGHT, rightHeight - MIN_TOP_PANEL_HEIGHT)
        setBottomPanelHeight((prev) => clamp(prev, MIN_BOTTOM_PANEL_HEIGHT, maxBottom))
      }
    }

    syncLayoutBounds()
    window.addEventListener('resize', syncLayoutBounds)
    return () => {
      window.removeEventListener('resize', syncLayoutBounds)
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
    const tabId = getTabId(connectionId, slaveId, registerGroupId)
    const savedSettings = workspaceTabSettings[tabId]
    setOpenTabs((prev) => {
      if (prev.find((t) => getTabId(t.connectionId, t.slaveId, t.registerGroupId) === tabId)) {
        return prev
      }
      return [
        ...prev,
        {
          connectionId,
          slaveId,
          registerGroupId,
          selectedAddresses: new Set(),
          interpretationTab: savedSettings?.interpretationTab || 'basic',
          stringEncoding: savedSettings?.stringEncoding || globalEncoding,
          typedInterpretation: savedSettings?.typedInterpretation || {},
          registerDisplayFormat: savedSettings?.registerDisplayFormat || {}
        }
      ]
    })
    setActiveTabId(tabId)
  }

  const selectRegisterGroup = (connectionId: string, slaveId: string, registerGroupId: string) => {
    setSelectedNodeId(`${connectionId}/${slaveId}/${registerGroupId}`)
    const tabId = getTabId(connectionId, slaveId, registerGroupId)
    const isOpened = openTabs.some(
      (tab) => getTabId(tab.connectionId, tab.slaveId, tab.registerGroupId) === tabId
    )
    if (isOpened) {
      setActiveTabId(tabId)
    }
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
    setOpenTabs((prev) =>
      prev.map((t) =>
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

  const applyTypedInterpretationToSelection = (tabId: string, mode: PlotInterpretation): boolean => {
    const tab = openTabs.find(
      (t) => `${t.connectionId}-${t.slaveId}-${t.registerGroupId}` === tabId
    )
    if (!tab) return false

    const startAddresses = getBatchAssignableAddresses(tab.selectedAddresses, mode)
    if (startAddresses.length === 0) {
      showUserError('Current selection cannot be grouped for this interpretation type.')
      return false
    }

    updateTab(tabId, {
      typedInterpretation: {
        ...tab.typedInterpretation,
        ...Object.fromEntries(startAddresses.map((address) => [address, mode]))
      }
    })
    return true
  }

  const applyDisplayFormatToSelection = (tabId: string, mode: RegisterDisplayFormat): boolean => {
    const tab = openTabs.find((t) => `${t.connectionId}-${t.slaveId}-${t.registerGroupId}` === tabId)
    if (!tab || tab.selectedAddresses.size === 0) {
      showUserError('Please select at least one register first.')
      return false
    }

    updateTab(tabId, {
      registerDisplayFormat: {
        ...tab.registerDisplayFormat,
        ...Object.fromEntries([...tab.selectedAddresses].map((address) => [address, mode]))
      }
    })
    return true
  }

  const handleOpenTypedBatchMenu = (
    event: ReactMouseEvent<HTMLTableRowElement>,
    tabId: string
  ): void => {
    event.preventDefault()
    setDisplayFormatEditMenu(null)
    setTypedValueEditMenu(null)
    setTypedBatchMenu({
      tabId,
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6
    })
  }

  const handleOpenTypedValueEditMenu = (
    event: ReactMouseEvent<HTMLElement>,
    tabId: string,
    address: number
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    setDisplayFormatEditMenu(null)
    setTypedBatchMenu(null)
    setTypedValueEditMenu({
      tabId,
      address,
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6
    })
  }

  const handleOpenDisplayFormatMenu = (
    event: ReactMouseEvent<HTMLElement>,
    tabId: string,
    address: number
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    setTypedBatchMenu(null)
    setTypedValueEditMenu(null)
    setDisplayFormatEditMenu({
      tabId,
      address,
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6
    })
  }

  const updateRegister = (
    connectionId: string,
    slaveId: string,
    groupId: string,
    address: number,
    updates: Partial<Register>
  ) => {
    const normalizedUpdates =
      typeof updates.value === 'number'
        ? { ...updates, value: clamp(Math.round(updates.value), 0, 65535) }
        : updates
    setConnections((prev) =>
      prev.map((conn) => {
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
                    reg.address === address ? { ...reg, ...normalizedUpdates } : reg
                  )
                }
              })
            }
          })
        }
      })
    )

    if (typeof normalizedUpdates.value !== 'number') return

    const connection = connectionsRef.current.find((conn) => conn.id === connectionId)
    if (!connection?.isOpen) return
    const slave = connection.slaves.find((item) => item.id === slaveId)
    if (!slave) return
    const group = slave.registerGroups.find((item) => item.id === groupId)
    if (!group) return

    const unitId = toUnitIdString(slave.slaveId)
    const value = clamp(Math.round(normalizedUpdates.value), 0, 65535)
    const baseRegister = group.registers.find((item) => item.address === address)
    const nextRegister = {
      address,
      value,
      variableName: normalizedUpdates.variableName ?? baseRegister?.variableName ?? '',
      comment: normalizedUpdates.comment ?? baseRegister?.comment ?? ''
    }

    const boolType = getBackendBoolRegisterType(group.type)
    if (boolType) {
      void window.api.setBool({
        uuid: connectionId,
        unitId,
        registerType: boolType,
        address,
        state: value !== 0
      })
      return
    }

    const numberType = getBackendNumberRegisterType(group.type)
    if (!numberType) return

    void window.api.addReplaceServerRegister({
      uuid: connectionId,
      unitId,
      littleEndian: false,
      params: toStaticRegisterParams(nextRegister, numberType)
    })
  }

  const updateRegistersBatch = (
    connectionId: string,
    slaveId: string,
    groupId: string,
    valueMap: Record<number, number>
  ): void => {
    setConnections((prev) =>
      prev.map((conn) => {
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
                  registers: group.registers.map((reg) => {
                    const next = valueMap[reg.address]
                    if (next === undefined) return reg
                    return { ...reg, value: clamp(Math.round(next), 0, 65535) }
                  })
                }
              })
            }
          })
        }
      })
    )

    const connection = connectionsRef.current.find((conn) => conn.id === connectionId)
    if (!connection?.isOpen) return
    const slave = connection.slaves.find((item) => item.id === slaveId)
    if (!slave) return
    const group = slave.registerGroups.find((item) => item.id === groupId)
    if (!group) return

    const unitId = toUnitIdString(slave.slaveId)
    const boolType = getBackendBoolRegisterType(group.type)
    if (boolType) {
      Object.entries(valueMap).forEach(([addressStr, rawValue]) => {
        const address = Number(addressStr)
        const value = clamp(Math.round(rawValue), 0, 65535)
        void window.api.setBool({
          uuid: connectionId,
          unitId,
          registerType: boolType,
          address,
          state: value !== 0
        })
      })
      return
    }

    const numberType = getBackendNumberRegisterType(group.type)
    if (!numberType) return

    Object.entries(valueMap).forEach(([addressStr, rawValue]) => {
      const address = Number(addressStr)
      const value = clamp(Math.round(rawValue), 0, 65535)
      const existing = group.registers.find((item) => item.address === address)
      const nextRegister: Register = {
        address,
        value,
        variableName: existing?.variableName ?? '',
        comment: existing?.comment ?? ''
      }

      void window.api.addReplaceServerRegister({
        uuid: connectionId,
        unitId,
        littleEndian: false,
        params: toStaticRegisterParams(nextRegister, numberType)
      })
    })
  }

  const getScriptTargetEntries = (
    connectionId: string,
    unitId: number,
    registerType: RegisterGroup['type']
  ): Array<{ slaveId: string; groupId: string; registers: Register[] }> => {
    const connection = connectionsRef.current.find((conn) => conn.id === connectionId)
    if (!connection) return []

    const targets: Array<{ slaveId: string; groupId: string; registers: Register[] }> = []
    connection.slaves.forEach((slave) => {
      if (slave.slaveId !== unitId) return
      slave.registerGroups.forEach((group) => {
        if (group.type !== registerType) return
        targets.push({ slaveId: slave.id, groupId: group.id, registers: group.registers })
      })
    })
    return targets
  }

  const executeScript = async (
    connectionId: string,
    scriptId: string,
    trigger: 'manual' | 'interval'
  ): Promise<void> => {
    const scripts = scriptsByConnection[connectionId] ?? []
    const script = scripts.find((item) => item.id === scriptId)
    if (!script) return

    const scopeKey = `${connectionId}:${scriptId}`
    const scope = scriptStateMapRef.current[scopeKey] ?? {}
    scriptStateMapRef.current[scopeKey] = scope

    const api: ScriptRuntimeApi = {
      getValue: (unitId: number, registerType: RegisterGroup['type'], address: number): number | undefined => {
        const targets = getScriptTargetEntries(connectionId, unitId, registerType)
        for (const target of targets) {
          const register = target.registers.find((item) => item.address === address)
          if (register) return register.value
        }
        return undefined
      },
      setValue: (
        unitId: number,
        registerType: RegisterGroup['type'],
        address: number,
        value: number
      ): boolean => {
        const targets = getScriptTargetEntries(connectionId, unitId, registerType)
        if (targets.length === 0) return false
        const normalized =
          registerType === '01' || registerType === '02'
            ? value !== 0
              ? 1
              : 0
            : clamp(Math.round(value), 0, 65535)

        targets.forEach((target) => {
          updateRegister(connectionId, target.slaveId, target.groupId, address, { value: normalized })
        })
        return true
      },
      setValues: (
        unitId: number,
        registerType: RegisterGroup['type'],
        values: Record<number, number>
      ): number => {
        const targets = getScriptTargetEntries(connectionId, unitId, registerType)
        if (targets.length === 0) return 0
        const normalizedMap = Object.fromEntries(
          Object.entries(values).map(([addressStr, value]) => {
            const normalized =
              registerType === '01' || registerType === '02'
                ? value !== 0
                  ? 1
                  : 0
                : clamp(Math.round(value), 0, 65535)
            return [Number(addressStr), normalized]
          })
        ) as Record<number, number>

        targets.forEach((target) => {
          updateRegistersBatch(connectionId, target.slaveId, target.groupId, normalizedMap)
        })
        return Object.keys(normalizedMap).length
      },
      log: (...args: unknown[]): void => {
        console.log(`[Script:${connectionId}/${script.name}]`, ...args)
        void window.api.appendSystemLog({
          level: 'info',
          source: 'script',
          module: 'server.ui',
          message: `[${script.name}] ${args.map((arg) => String(arg)).join(' ')}`,
          connectionId,
          details: { scriptId, trigger }
        })
      }
    }

    try {
      void window.api.appendSystemLog({
        level: 'info',
        source: 'script',
        module: 'server.ui',
        message: `Script started: ${script.name}`,
        connectionId,
        details: { scriptId, trigger }
      })

      const runner = new Function(
        'api',
        'state',
        'event',
        `"use strict"; return (async () => { ${script.code}\n })();`
      ) as (
        api: ScriptRuntimeApi,
        state: Record<string, unknown>,
        event: ScriptRuntimeEvent
      ) => Promise<void>

      await runner(api, scope, { type: trigger, timestamp: Date.now() })

      setScriptsByConnection((prev) => ({
        ...prev,
        [connectionId]: (prev[connectionId] ?? []).map((item) =>
          item.id === scriptId ? { ...item, lastRunAt: Date.now(), lastError: undefined } : item
        )
      }))
      void window.api.appendSystemLog({
        level: 'info',
        source: 'script',
        module: 'server.ui',
        message: `Script completed: ${script.name}`,
        connectionId,
        details: { scriptId, trigger }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setScriptsByConnection((prev) => ({
        ...prev,
        [connectionId]: (prev[connectionId] ?? []).map((item) =>
          item.id === scriptId ? { ...item, enabled: false, lastError: message } : item
        )
      }))
      console.error(`Script failed (${connectionId}/${script.name}):`, error)
      showUserError(`Script "${script.name}" failed and was disabled.`)
      void window.api.appendSystemLog({
        level: 'error',
        source: 'script',
        module: 'server.ui',
        message: `Script failed: ${script.name} - ${message}`,
        connectionId,
        details: { scriptId, trigger }
      })
    }
  }

  useEffect(() => {
    const offApply = onEvent('script_editor_apply', ({ connectionId, scripts }) => {
      setScriptsByConnection((prev) => ({
        ...prev,
        [connectionId]: scripts
      }))
    })
    const offRun = onEvent('script_editor_run_once', ({ connectionId, scriptId }) => {
      void executeScript(connectionId, scriptId, 'manual')
    })

    return () => {
      offApply()
      offRun()
    }
  }, [executeScript])

  useEffect(() => {
    const activeTimerKeys = new Set<string>()

    Object.entries(scriptsByConnection).forEach(([connectionId, scripts]) => {
      scripts.forEach((script) => {
        if (!script.enabled) return
        const key = `${connectionId}:${script.id}`
        activeTimerKeys.add(key)
        const intervalMs = Math.max(100, Number(script.intervalMs) || 1000)
        const existing = scriptTimerMapRef.current[key]
        if (existing && existing.intervalMs === intervalMs) return
        if (existing) {
          clearInterval(existing.timer)
          delete scriptTimerMapRef.current[key]
        }
        const timer = setInterval(() => {
          void executeScript(connectionId, script.id, 'interval')
        }, intervalMs)
        scriptTimerMapRef.current[key] = { timer, intervalMs }
      })
    })

    Object.entries(scriptTimerMapRef.current).forEach(([key, timer]) => {
      if (activeTimerKeys.has(key)) return
      clearInterval(timer.timer)
      delete scriptTimerMapRef.current[key]
    })
  }, [scriptsByConnection, executeScript])

  useEffect(() => {
    return () => {
      Object.values(scriptTimerMapRef.current).forEach((timer) => clearInterval(timer.timer))
      scriptTimerMapRef.current = {}
    }
  }, [])

  useEffect(() => {
    setOpenTabs((prev) =>
      prev.map((tab) => (tab.stringEncoding === globalEncoding ? tab : { ...tab, stringEncoding: globalEncoding }))
    )
    setWorkspaceTabSettings((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((key) => {
        const item = next[key]
        if (item.stringEncoding !== globalEncoding) {
          next[key] = { ...item, stringEncoding: globalEncoding }
        }
      })
      return next
    })
  }, [globalEncoding])

  useEffect(() => {
    const syncFromStorage = (): void => {
      setGlobalEncoding(getGlobalStringEncodingPreference())
    }

    const onStorage = (event: StorageEvent): void => {
      if (event.key === GLOBAL_STRING_ENCODING_KEY) {
        syncFromStorage()
      }
    }

    const onPreferenceChange = (event: Event): void => {
      const customEvent = event as CustomEvent<GlobalPreferenceChangeDetail>
      if (customEvent.detail?.key === GLOBAL_STRING_ENCODING_KEY) {
        syncFromStorage()
      }
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(GLOBAL_PREFERENCE_CHANGE_EVENT, onPreferenceChange as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(GLOBAL_PREFERENCE_CHANGE_EVENT, onPreferenceChange as EventListener)
    }
  }, [])

  useEffect(() => {
    setInlineValueEditCell(null)
  }, [activeTabId])

  const handleNewConnection = (connection: Connection) => {
    setConnections([...connections, connection])
    setExpandedConnections(new Set([...expandedConnections, connection.id]))
    setScriptsByConnection((prev) => ({
      ...prev,
      [connection.id]: prev[connection.id] ?? []
    }))
  }

  const handleNewSlave = (slave: Slave) => {
    if (!selectedConnectionForSlave) return
    const connection = connections.find((item) => item.id === selectedConnectionForSlave)
    setConnections(
      connections.map((c) =>
        c.id === selectedConnectionForSlave ? { ...c, slaves: [...c.slaves, slave] } : c
      )
    )
    setExpandedSlaves(new Set([...expandedSlaves, slave.id]))

    if (connection?.isOpen) {
      void syncSlaveToBackend(connection.id, slave).catch((error) => {
        console.error('Failed to sync new slave:', error)
        showUserError('Failed to sync slave data to backend.')
      })
    }
  }

  const handleEditConnection = () => {
    const conn = getSelectedConnection()
    if (!conn) return
    setEditingConnection(conn)
    setEditConnectionOpen(true)
  }

  const handleSaveEditedConnection = async (connection: Connection) => {
    setConnections(connections.map((c) => (c.id === connection.id ? connection : c)))
    setEditConnectionOpen(false)
    setEditingConnection(undefined)

    if (!connection.isOpen) return

    try {
      await window.api.createServer({ uuid: connection.id, config: toServerConfig(connection) })
      await syncConnectionToBackend(connection)
    } catch (error) {
      console.error('Failed to apply edited connection settings:', error)
      showUserError('Failed to apply edited connection settings.')
    }
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
    const connection = connections.find((item) => item.id === editingSlaveConnectionId)
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

    if (connection?.isOpen) {
      void syncSlaveToBackend(connection.id, slave).catch((error) => {
        console.error('Failed to sync edited slave:', error)
        showUserError('Failed to sync slave data to backend.')
      })
    }
  }

  const getWorkspaceSnapshot = (): PersistedWorkspaceSnapshot => {
    const tabSettingsSnapshot = buildWorkspaceTabSettingsSnapshot(
      workspaceTabSettings,
      openTabs.map((tab) => ({
        tabId: getTabId(tab.connectionId, tab.slaveId, tab.registerGroupId),
        interpretationTab: tab.interpretationTab,
        stringEncoding: tab.stringEncoding,
        typedInterpretation: tab.typedInterpretation,
        registerDisplayFormat: tab.registerDisplayFormat
      }))
    )

    return {
      version: 4,
      connections: connections.map((c) => ({
        ...c,
        isOpen: false
      })),
      tabSettings: tabSettingsSnapshot,
      scriptsByConnection,
      openTabs: openTabs.map((tab) => ({
        connectionId: tab.connectionId,
        slaveId: tab.slaveId,
        registerGroupId: tab.registerGroupId
      })),
      activeTabId
    }
  }
  const serializeWorkspaceSnapshot = (workspace: PersistedWorkspaceSnapshot): string =>
    JSON.stringify(workspace)
  const workspaceCurrentFingerprint = useMemo(
    () => serializeWorkspaceSnapshot(getWorkspaceSnapshot()),
    [connections, workspaceTabSettings, scriptsByConnection, openTabs, activeTabId]
  )
  const isWorkspaceDirty = getWorkspaceDirtyState(
    workspaceCurrentFingerprint,
    workspaceSavedFingerprint,
    workspaceInitialFingerprintRef.current
  )

  const requestUnsavedChangesConfirmation = (): Promise<boolean> => {
    if (!isWorkspaceDirty) return Promise.resolve(true)
    if (unsavedConfirmPromiseRef.current) return unsavedConfirmPromiseRef.current

    const promise = new Promise<boolean>((resolve) => {
      unsavedConfirmResolverRef.current = resolve
      setUnsavedConfirmOpen(true)
    })
    unsavedConfirmPromiseRef.current = promise
    return promise
  }

  const resolveUnsavedChangesConfirmation = (confirmed: boolean): void => {
    setUnsavedConfirmOpen(false)
    const resolver = unsavedConfirmResolverRef.current
    unsavedConfirmResolverRef.current = null
    unsavedConfirmPromiseRef.current = null
    resolver?.(confirmed)
  }

  useEffect(() => {
    if (workspaceInitialFingerprintRef.current === null) {
      workspaceInitialFingerprintRef.current = workspaceCurrentFingerprint
    }
  }, [workspaceCurrentFingerprint])

  const getDefaultWorkspaceFilename = () =>
    `${DEFAULT_WORKSPACE_FILENAME_PREFIX}_${new Date().toISOString().slice(0, 10)}.json`

  const loadRecentWorkspacesFromStorage = (): RecentWorkspaceEntry[] => {
    try {
      const raw = localStorage.getItem(RECENT_WORKSPACES_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((item) => item && typeof item === 'object') as RecentWorkspaceEntry[]
    } catch {
      return []
    }
  }

  const persistRecentWorkspaces = (entries: RecentWorkspaceEntry[]): void => {
    setRecentWorkspaces(entries)
    localStorage.setItem(RECENT_WORKSPACES_STORAGE_KEY, JSON.stringify(entries))
  }

  const markLastWorkspaceId = (id: string | null): void => {
    if (!id) {
      localStorage.removeItem(LAST_WORKSPACE_ID_STORAGE_KEY)
      return
    }
    localStorage.setItem(LAST_WORKSPACE_ID_STORAGE_KEY, id)
  }

  const upsertRecentWorkspaceByPath = (
    path: string,
    name: string,
    options?: { setAsLast?: boolean }
  ): void => {
    const existing = recentWorkspaces.find((entry) => entry.path === path)
    const nextEntry: RecentWorkspaceEntry = existing
      ? { ...existing, name, updatedAt: Date.now() }
      : { id: uuidv4(), name, path, updatedAt: Date.now() }

    const merged = [nextEntry, ...recentWorkspaces.filter((entry) => entry.path !== path)].slice(
      0,
      MAX_RECENT_WORKSPACES
    )
    persistRecentWorkspaces(merged)
    if (options?.setAsLast !== false) {
      markLastWorkspaceId(nextEntry.id)
    }
  }

  const removeRecentWorkspace = (entryId: string): void => {
    const next = recentWorkspaces.filter((entry) => entry.id !== entryId)
    persistRecentWorkspaces(next)
    const lastId = localStorage.getItem(LAST_WORKSPACE_ID_STORAGE_KEY)
    if (lastId === entryId) {
      markLastWorkspaceId(null)
    }
  }

  const applyWorkspaceSnapshot = (
    workspace: PersistedWorkspaceSnapshot,
    options?: { fileName?: string; filePath?: string | null }
  ): boolean => {
    const workspaceVersion = workspace.version
    if (
      (workspaceVersion === 1 || workspaceVersion === 2 || workspaceVersion === 3 || workspaceVersion === 4) &&
      Array.isArray(workspace.connections)
    ) {
      const restoredTabSettings =
        (workspaceVersion === 2 || workspaceVersion === 3 || workspaceVersion === 4) &&
        workspace.tabSettings &&
        typeof workspace.tabSettings === 'object'
          ? workspace.tabSettings
          : {}

      const restoredOpenTabs =
        workspaceVersion === 4 && Array.isArray(workspace.openTabs)
          ? workspace.openTabs
              .map((savedTab) => {
                const connection = workspace.connections.find((conn) => conn.id === savedTab.connectionId)
                const slave = connection?.slaves.find((item) => item.id === savedTab.slaveId)
                const group = slave?.registerGroups.find((item) => item.id === savedTab.registerGroupId)
                if (!connection || !slave || !group) return null
                const tabId = getTabId(savedTab.connectionId, savedTab.slaveId, savedTab.registerGroupId)
                const savedSettings = restoredTabSettings[tabId]
                return {
                  connectionId: savedTab.connectionId,
                  slaveId: savedTab.slaveId,
                  registerGroupId: savedTab.registerGroupId,
                  selectedAddresses: new Set<number>(),
                  interpretationTab: savedSettings?.interpretationTab || 'basic',
                  stringEncoding: savedSettings?.stringEncoding || globalEncoding,
                  typedInterpretation: savedSettings?.typedInterpretation || {},
                  registerDisplayFormat: savedSettings?.registerDisplayFormat || {}
                } as OpenTab
              })
              .filter((tab): tab is OpenTab => tab !== null)
          : []

      setConnections(workspace.connections)
      setWorkspaceTabSettings(restoredTabSettings)
      setScriptsByConnection(
        (workspaceVersion === 3 || workspaceVersion === 4) &&
          workspace.scriptsByConnection &&
          typeof workspace.scriptsByConnection === 'object'
          ? workspace.scriptsByConnection
          : {}
      )
      setOpenTabs(restoredOpenTabs)
      const preferredActiveTabId =
        workspaceVersion === 4 && typeof workspace.activeTabId === 'string' ? workspace.activeTabId : null
      const hasPreferredTab =
        preferredActiveTabId &&
        restoredOpenTabs.some(
          (tab) => getTabId(tab.connectionId, tab.slaveId, tab.registerGroupId) === preferredActiveTabId
        )
      setActiveTabId(
        hasPreferredTab
          ? preferredActiveTabId
          : restoredOpenTabs[0]
            ? getTabId(
                restoredOpenTabs[0].connectionId,
                restoredOpenTabs[0].slaveId,
                restoredOpenTabs[0].registerGroupId
              )
            : null
      )
      setExpandedConnections(new Set(restoredOpenTabs.map((tab) => tab.connectionId)))
      setExpandedSlaves(new Set(restoredOpenTabs.map((tab) => tab.slaveId)))
      setWorkspaceFileHandle(null)
      setWorkspaceFilename(options?.fileName || null)
      setWorkspaceFilePath(options?.filePath || null)
      return true
    }
    showUserError('Invalid workspace file format.')
    return false
  }

  const openWorkspaceByPath = async (
    path: string,
    options?: { fallbackName?: string; removeOnError?: boolean; setAsLast?: boolean }
  ): Promise<boolean> => {
    try {
      const text = await window.api.readTextFile(path)
      const workspace = JSON.parse(text) as PersistedWorkspaceSnapshot
      const fileName = path.split(/[\\/]/).pop() || options?.fallbackName
      const applied = applyWorkspaceSnapshot(workspace, { fileName, filePath: path })
      if (!applied) return false
      setWorkspaceSavedFingerprint(serializeWorkspaceSnapshot(workspace))

      void window.api.appendSystemLog({
        level: 'info',
        source: 'workspace',
        module: 'server.ui',
        message: `Workspace loaded: ${fileName}`,
        details: { path }
      })

      upsertRecentWorkspaceByPath(path, fileName || options?.fallbackName || path, {
        setAsLast: options?.setAsLast
      })
      return true
    } catch (error) {
      console.warn('Failed to load workspace from path:', path, error)
      if (options?.removeOnError) {
        const failedEntry = recentWorkspaces.find((entry) => entry.path === path)
        if (failedEntry) removeRecentWorkspace(failedEntry.id)
      }
      return false
    }
  }

  const downloadWorkspaceSnapshot = (workspace: PersistedWorkspaceSnapshot) => {
    const json = JSON.stringify(workspace, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = workspaceFilename || getDefaultWorkspaceFilename()
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const saveWorkspaceWithHandle = async (
    workspace: PersistedWorkspaceSnapshot,
    forceChooseNewFile: boolean
  ): Promise<boolean> => {
    if (workspaceFilePath && !forceChooseNewFile) {
      try {
        await window.api.writeTextFile(workspaceFilePath, JSON.stringify(workspace, null, 2))
        void window.api.appendSystemLog({
          level: 'info',
          source: 'workspace',
          module: 'server.ui',
          message: `Workspace saved: ${workspaceFilePath}`
        })
        upsertRecentWorkspaceByPath(
          workspaceFilePath,
          workspaceFilename || workspaceFilePath.split(/[\\/]/).pop() || 'Workspace',
          { setAsLast: true }
        )
        setWorkspaceSavedFingerprint(serializeWorkspaceSnapshot(workspace))
        return true
      } catch (error) {
        console.error('Failed to write workspace via path:', error)
      }
    }

    const fsWindow = window as Window & {
      showSaveFilePicker?: (options?: {
        suggestedName?: string
        types?: Array<{ description: string; accept: Record<string, string[]> }>
      }) => Promise<WorkspaceFileHandle>
    }

    if (typeof fsWindow.showSaveFilePicker !== 'function') return false

    try {
      let handle = workspaceFileHandle
      if (!handle || forceChooseNewFile) {
        handle = await fsWindow.showSaveFilePicker({
          suggestedName: workspaceFilename || getDefaultWorkspaceFilename(),
          types: [
            {
              description: 'Modbux Workspace',
              accept: { 'application/json': ['.json'] }
            }
          ]
        })
      }

      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(workspace, null, 2))
      await writable.close()
      void window.api.appendSystemLog({
        level: 'info',
        source: 'workspace',
        module: 'server.ui',
        message: `Workspace saved via file picker: ${handle.name || 'unnamed'}`
      })
      setWorkspaceFileHandle(handle)
      if (handle.name) setWorkspaceFilename(handle.name)
      if (workspaceFilePath) {
        upsertRecentWorkspaceByPath(
          workspaceFilePath,
          workspaceFilename || workspaceFilePath.split(/[\\/]/).pop() || 'Workspace',
          { setAsLast: true }
        )
      }
      setWorkspaceSavedFingerprint(serializeWorkspaceSnapshot(workspace))
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return true
      }
      console.error('Failed to write workspace via file handle:', error)
      return false
    }
  }

  const handleSaveWorkspace = async () => {
    const workspace = getWorkspaceSnapshot()
    const saved = await saveWorkspaceWithHandle(workspace, false)
    if (!saved) {
      downloadWorkspaceSnapshot(workspace)
      setWorkspaceSavedFingerprint(serializeWorkspaceSnapshot(workspace))
    }
  }

  const handleSaveWorkspaceAs = async () => {
    const workspace = getWorkspaceSnapshot()
    const saved = await saveWorkspaceWithHandle(workspace, true)
    if (!saved) {
      downloadWorkspaceSnapshot(workspace)
      setWorkspaceSavedFingerprint(serializeWorkspaceSnapshot(workspace))
    }
  }

  const handleOpenWorkspace = async () => {
    const shouldContinue = await requestUnsavedChangesConfirmation()
    if (!shouldContinue) return

    try {
      const filePath = await window.api.pickWorkspaceFile()
      if (!filePath) return
      const text = await window.api.readTextFile(filePath)
      const workspace = JSON.parse(text) as PersistedWorkspaceSnapshot
      const fileName = filePath.split(/[\\/]/).pop() || 'Workspace'
      const applied = applyWorkspaceSnapshot(workspace, { fileName, filePath })
      if (applied) {
        setWorkspaceSavedFingerprint(serializeWorkspaceSnapshot(workspace))
        upsertRecentWorkspaceByPath(filePath, fileName, { setAsLast: true })
      }
    } catch (error) {
      console.error('Failed to open workspace:', error)
      showUserError('Failed to open workspace file.')
    }
  }

  const closeTitleMenus = (): void => {
    setWorkspaceMenuAnchorEl(null)
    setConnectionMenuAnchorEl(null)
    setToolsMenuAnchorEl(null)
  }

  const handleSelectRecentWorkspace = (entry: RecentWorkspaceEntry): void => {
    void (async () => {
      const shouldContinue = await requestUnsavedChangesConfirmation()
      if (!shouldContinue) return

      const ok = await openWorkspaceByPath(entry.path, {
        fallbackName: entry.name,
        removeOnError: true,
        setAsLast: true
      })
      if (!ok) {
        showUserError('Workspace file is invalid or no longer exists.')
      }
      closeTitleMenus()
    })()
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
      await syncConnectionToBackend(conn)
      setConnections((prev) => prev.map((c) => (c.id === conn.id ? { ...c, isOpen: true } : c)))
    } catch (error) {
      console.error('Failed to open connection:', error)
      try {
        await window.api.deleteServer(conn.id)
      } catch {
        // Ignore cleanup failures after open/sync error.
      }
      showUserError('Failed to open connection.')
    }
  }

  const handleCloseWorkspace = async (): Promise<void> => {
    const shouldContinue = await requestUnsavedChangesConfirmation()
    if (!shouldContinue) return

    const activeConnections = connectionsRef.current
    const openConnections = activeConnections.filter((conn) => conn.isOpen)

    if (openConnections.length > 0) {
      const results = await Promise.allSettled(
        openConnections.map((conn) => window.api.deleteServer(conn.id))
      )
      const hasCloseError = results.some((result) => result.status === 'rejected')
      if (hasCloseError) {
        showUserError('Some connections failed to close while closing workspace.')
      }
    }

    Object.values(scriptTimerMapRef.current).forEach((timer) => clearInterval(timer.timer))
    scriptTimerMapRef.current = {}
    scriptStateMapRef.current = {}

    sendEvent('close_register_plot_windows')

    setConnections([])
    setWorkspaceTabSettings({})
    setScriptsByConnection({})
    setOpenTabs([])
    setActiveTabId(null)
    setSelectedNodeId(null)
    setExpandedConnections(new Set())
    setExpandedSlaves(new Set())
    setPlotWindows([])
    setWorkspaceFileHandle(null)
    setWorkspaceFilename(null)
    setWorkspaceFilePath(null)
    setWorkspaceSavedFingerprint(null)
    workspaceInitialFingerprintRef.current = null
    closeTitleMenus()
    markLastWorkspaceId(null)
  }

  const handleCloseConnection = async () => {
    const conn = getSelectedConnection()
    if (!conn) return
    try {
      await window.api.deleteServer(conn.id)
      setConnections((prev) => prev.map((c) => (c.id === conn.id ? { ...c, isOpen: false } : c)))
    } catch (error) {
      console.error('Failed to close connection:', error)
      showUserError('Failed to close connection.')
    }
  }

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return
      if (!event.altKey || event.ctrlKey || event.metaKey) return
      const key = event.key.toLowerCase()

      switch (key) {
        case 'o':
          event.preventDefault()
          void handleOpenWorkspace()
          closeTitleMenus()
          break
        case 's':
          event.preventDefault()
          void handleSaveWorkspace()
          closeTitleMenus()
          break
        case 'a':
          event.preventDefault()
          void handleSaveWorkspaceAs()
          closeTitleMenus()
          break
        case 'w':
          event.preventDefault()
          void handleCloseWorkspace()
          closeTitleMenus()
          break
        case 'n':
          event.preventDefault()
          setNewConnectionOpen(true)
          closeTitleMenus()
          break
        case 'l':
          event.preventDefault()
          if (connectionsRef.current.length > 0) {
            setSelectedConnectionForSlave(selectedNodeId?.split('/')[0] || connectionsRef.current[0]?.id)
            setNewSlaveOpen(true)
            closeTitleMenus()
          }
          break
        case 'c':
          event.preventDefault()
          void handleOpenConnection()
          closeTitleMenus()
          break
        case 'd':
          event.preventDefault()
          void handleCloseConnection()
          closeTitleMenus()
          break
        case 'm':
          event.preventDefault()
          sendEvent('open_comm_log_window')
          closeTitleMenus()
          break
        case 'g':
          event.preventDefault()
          sendEvent('open_system_log_window')
          closeTitleMenus()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedNodeId, connections, handleOpenConnection, handleCloseConnection])

  useEffect(() => {
    const offCloseRequest = onEvent('request_window_close', () => {
      void (async () => {
        const shouldClose = await requestUnsavedChangesConfirmation()
        if (!shouldClose) return
        await window.api.confirmWindowClose()
      })()
    })

    return () => {
      offCloseRequest()
    }
  }, [isWorkspaceDirty])

  const handleOpenRegisterPlot = (
    tab: OpenTab,
    connection: Connection,
    slave: Slave,
    group: RegisterGroup
  ): void => {
    const selectedRegisters = group.registers.filter((reg) => tab.selectedAddresses.has(reg.address))
    if (selectedRegisters.length === 0) return

    const allAddresses = new Set(group.registers.map((reg) => reg.address))
    const typedSpanHints = buildTypedSpanHints(allAddresses, tab.typedInterpretation)
    const defaultInterpretation = getDefaultTypedInterpretation(group.type)

    const seriesByAddress = new Map<number, RegisterPlotWindowInit['series'][number]>()
    selectedRegisters
      .sort((a, b) => a.address - b.address)
      .forEach((reg) => {
        const explicitMode = tab.typedInterpretation[reg.address]
        const typedSpanHint = typedSpanHints.get(reg.address)
        const effectiveTypedSpanHint =
          explicitMode && typedSpanHint && explicitMode !== typedSpanHint.mode ? undefined : typedSpanHint
        const startAddress = effectiveTypedSpanHint ? effectiveTypedSpanHint.startAddress : reg.address
        const interpretation = explicitMode || effectiveTypedSpanHint?.mode || defaultInterpretation

        if (seriesByAddress.has(startAddress)) return

        const sourceRegister = group.registers.find((item) => item.address === startAddress) || reg
        const colorIndex = seriesByAddress.size % PLOT_SERIES_COLORS.length
        seriesByAddress.set(startAddress, {
          address: startAddress,
          label: sourceRegister.variableName || formatAddress(startAddress),
          color: PLOT_SERIES_COLORS[colorIndex],
          interpretation
        })
      })

    const payload: RegisterPlotWindowInit = {
      chartId: uuidv4(),
      title: `Plot - ${connection.alias} / ${slave.alias} / ${group.name}`,
      connectionId: connection.id,
      connectionAlias: connection.alias,
      slaveId: slave.id,
      slaveAlias: slave.alias,
      registerGroupId: group.id,
      registerGroupName: group.name,
      registerType: group.type,
      series: [...seriesByAddress.values()]
    }

    sendEvent('open_register_plot_window', payload)
    setPlotWindows((prev) => [
      ...prev,
      {
        ...payload,
        selectionColor: getPlotSelectionColor(prev.length)
      }
    ])
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', pt: WINDOW_TITLEBAR_PADDING_TOP }}>
      {(() => {
        const selectedConn = getSelectedConnection()
        const isConnectionSelected = selectedNodeId && !selectedNodeId.includes('/')
        const isSlaveSelected = !!getSelectedSlave()
        const isConnectionOpen = selectedConn?.isOpen
        const scriptTargetConnectionId = selectedNodeId?.split('/')[0] || null
        return (
          <AppBar
            position="static"
            color="default"
            elevation={0}
            sx={{
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(11,18,32,0.82)' : 'rgba(236,243,252,0.98)',
              borderBottom: 1,
              borderColor: (theme) => (theme.palette.mode === 'dark' ? 'divider' : '#cbd5e1'),
              backdropFilter: 'blur(10px)'
            }}
          >
            <Toolbar
              variant="dense"
              sx={{ gap: 0.8, minHeight: 44, flexWrap: 'wrap', WebkitAppRegion: 'drag' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<WorkspaceMenuIcon sx={{ fontSize: 16 }} />}
                  sx={TOP_MENU_BUTTON_SX}
                  onClick={(event) => {
                    setWorkspaceMenuAnchorEl(event.currentTarget)
                    setConnectionMenuAnchorEl(null)
                    setToolsMenuAnchorEl(null)
                  }}
                >
                  {t('server.toolbar.workspaceMenu')}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ConnectionMenuIcon sx={{ fontSize: 16 }} />}
                  sx={TOP_MENU_BUTTON_SX}
                  onClick={(event) => {
                    setConnectionMenuAnchorEl(event.currentTarget)
                    setWorkspaceMenuAnchorEl(null)
                    setToolsMenuAnchorEl(null)
                  }}
                >
                  {t('server.toolbar.connectionMenu')}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ToolsMenuIcon sx={{ fontSize: 16 }} />}
                  sx={TOP_MENU_BUTTON_SX}
                  onClick={(event) => {
                    setToolsMenuAnchorEl(event.currentTarget)
                    setWorkspaceMenuAnchorEl(null)
                    setConnectionMenuAnchorEl(null)
                  }}
                >
                  {t('server.toolbar.toolsMenu')}
                </Button>
              </Box>
              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1, WebkitAppRegion: 'no-drag' }}>
                {workspaceFilename ? (
                  <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 240 }} noWrap>
                    {workspaceFilename}
                    {isWorkspaceDirty ? '*' : ''}
                  </Typography>
                ) : null}
                <SettingsMenu />
              </Box>
              <Menu
                anchorEl={workspaceMenuAnchorEl}
                open={Boolean(workspaceMenuAnchorEl)}
                onClose={closeTitleMenus}
              >
                <MenuItem
                  onClick={() => {
                    void handleOpenWorkspace()
                    closeTitleMenus()
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('server.toolbar.openWorkspace')} (O)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+O
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void handleSaveWorkspace()
                    closeTitleMenus()
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('server.toolbar.saveWorkspace')} (S)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+S
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void handleSaveWorkspaceAs()
                    closeTitleMenus()
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('server.toolbar.saveWorkspaceAs')} (A)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+A
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void handleCloseWorkspace()
                    closeTitleMenus()
                  }}
                  disabled={connections.length === 0}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('server.toolbar.closeWorkspace')} (W)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+W
                    </Typography>
                  </Box>
                </MenuItem>
                <Divider />
                <MenuItem disabled>{t('server.toolbar.recentWorkspaces')}</MenuItem>
                {recentWorkspaces.length === 0 ? (
                  <MenuItem disabled>
                    <Typography variant="caption" color="text.secondary">
                      -
                    </Typography>
                  </MenuItem>
                ) : (
                  recentWorkspaces.map((entry) => (
                    <MenuItem key={entry.id} onClick={() => handleSelectRecentWorkspace(entry)}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 260 }}>
                        <Typography variant="body2" noWrap>
                          {entry.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(entry.updatedAt).toLocaleString()}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))
                )}
              </Menu>
              <Menu
                anchorEl={connectionMenuAnchorEl}
                open={Boolean(connectionMenuAnchorEl)}
                onClose={closeTitleMenus}
              >
                <MenuItem
                  onClick={() => {
                    setNewConnectionOpen(true)
                    closeTitleMenus()
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('server.toolbar.newConnection')} (N)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+N
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  disabled={connections.length === 0}
                  onClick={() => {
                    setSelectedConnectionForSlave(selectedNodeId?.split('/')[0] || connections[0]?.id)
                    setNewSlaveOpen(true)
                    closeTitleMenus()
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('server.toolbar.newSlave')} (L)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+L
                    </Typography>
                  </Box>
                </MenuItem>
                <Divider />
                <MenuItem
                  disabled={!isConnectionSelected || isConnectionOpen}
                  onClick={() => {
                    void handleOpenConnection()
                    closeTitleMenus()
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('common.connect')} (C)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+C
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  disabled={!isConnectionSelected || !isConnectionOpen}
                  onClick={() => {
                    void handleCloseConnection()
                    closeTitleMenus()
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('common.disconnect')} (D)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+D
                    </Typography>
                  </Box>
                </MenuItem>
              </Menu>
              <Menu anchorEl={toolsMenuAnchorEl} open={Boolean(toolsMenuAnchorEl)} onClose={closeTitleMenus}>
                <MenuItem
                  disabled={!isConnectionSelected}
                  onClick={() => {
                    handleEditConnection()
                    closeTitleMenus()
                  }}
                >
                  <Typography variant="body2">{t('server.toolbar.editConnection')}</Typography>
                </MenuItem>
                <MenuItem
                  disabled={!isSlaveSelected}
                  onClick={() => {
                    handleEditSlave()
                    closeTitleMenus()
                  }}
                >
                  <Typography variant="body2">{t('server.toolbar.editSlave')}</Typography>
                </MenuItem>
                <MenuItem
                  disabled={!selectedNodeId}
                  onClick={() => {
                    sendEvent('open_comm_log_window')
                    closeTitleMenus()
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('server.toolbar.commDetails')} (M)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+M
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    sendEvent('open_system_log_window')
                    closeTitleMenus()
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', minWidth: 250 }}>
                    <Typography variant="body2">{t('server.toolbar.systemLogs')} (G)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Alt+G
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  disabled={!scriptTargetConnectionId}
                  onClick={() => {
                    if (!scriptTargetConnectionId) return
                    const targetConn = connections.find((conn) => conn.id === scriptTargetConnectionId)
                    sendEvent('open_script_editor_window', {
                      connectionId: scriptTargetConnectionId,
                      connectionAlias: targetConn?.alias || 'Connection',
                      scripts: scriptsByConnection[scriptTargetConnectionId] ?? []
                    })
                    closeTitleMenus()
                  }}
                >
                  <Typography variant="body2">{t('server.toolbar.editScript')}</Typography>
                </MenuItem>
              </Menu>
            </Toolbar>
          </AppBar>
        )
      })()}

      <Box ref={mainSplitRef} sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Paper
          sx={{
            width: leftPanelWidth,
            minWidth: MIN_LEFT_PANEL_WIDTH,
            maxWidth: '70%',
            flexShrink: 0,
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
                  onDoubleClick={() => toggleConnection(conn.id)}
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
                        onDoubleClick={() => toggleSlave(slave.id)}
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
                            onSelect={() => selectRegisterGroup(conn.id, slave.id, group.id)}
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

        <Box
          data-testid="server-main-splitter"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(event) =>
            setLayoutResizeState({
              type: 'left',
              startX: event.clientX,
              startWidth: leftPanelWidth
            })
          }
          sx={{
            width: 6,
            cursor: 'col-resize',
            bgcolor: 'transparent',
            borderLeft: '1px solid',
            borderRight: '1px solid',
            borderColor: 'divider',
            transition: 'background-color 120ms ease',
            '&:hover': { bgcolor: 'action.hover' }
          }}
        />

        <Box
          ref={rightPanelRef}
          sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
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
                const isCoilGroup = group.type === '01' || group.type === '02'
                const effectiveInterpretationTab =
                  tab.interpretationTab === 'typed' ? 'basic' : tab.interpretationTab
                const panelRegisters = selectedRegisters
                const bottomPaginationKey = `${activeTabId}-${effectiveInterpretationTab}`
                const bottomPagination = bottomPanelPagination[bottomPaginationKey] || {
                  page: 0,
                  rowsPerPage: 200
                }
                const defaultTypedInterpretation = getDefaultTypedInterpretation(group.type)
                const rawRegisterMap = Object.fromEntries(
                  group.registers.map((r) => [r.address, r.value])
                )
                const allRegisterAddresses = group.registers.map((r) => r.address)
                const longGroups =
                  effectiveInterpretationTab === 'long'
                    ? extractConsecutiveGroups(panelRegisters, 2)
                    : []
                const floatGroups =
                  effectiveInterpretationTab === 'float'
                    ? extractConsecutiveGroups(panelRegisters, 2)
                    : []
                const doubleGroups =
                  effectiveInterpretationTab === 'double'
                    ? extractConsecutiveGroups(panelRegisters, 4)
                    : []
                const coilLongGroups =
                  effectiveInterpretationTab === 'long' && isCoilGroup
                    ? buildCoilConversionGroups(panelRegisters, 32)
                    : []
                const coilFloatGroups =
                  effectiveInterpretationTab === 'float' && isCoilGroup
                    ? buildCoilConversionGroups(panelRegisters, 32)
                    : []
                const coilDoubleGroups =
                  effectiveInterpretationTab === 'double' && isCoilGroup
                    ? buildCoilConversionGroups(panelRegisters, 64)
                    : []
                const bottomTotalRows =
                  effectiveInterpretationTab === 'long'
                    ? (isCoilGroup ? coilLongGroups.length : longGroups.length)
                    : effectiveInterpretationTab === 'float'
                      ? (isCoilGroup ? coilFloatGroups.length : floatGroups.length)
                      : effectiveInterpretationTab === 'double'
                        ? (isCoilGroup ? coilDoubleGroups.length : doubleGroups.length)
                        : panelRegisters.length
                const bottomMaxPage = Math.max(
                  0,
                  Math.ceil(bottomTotalRows / bottomPagination.rowsPerPage) - 1
                )
                const bottomCurrentPage = Math.min(bottomPagination.page, bottomMaxPage)
                const bottomStartIndex = bottomCurrentPage * bottomPagination.rowsPerPage
                const bottomEndIndex = bottomStartIndex + bottomPagination.rowsPerPage
                const pagedPanelRegisters = panelRegisters.slice(bottomStartIndex, bottomEndIndex)
                const pagedLongGroups = longGroups.slice(bottomStartIndex, bottomEndIndex)
                const pagedFloatGroups = floatGroups.slice(bottomStartIndex, bottomEndIndex)
                const pagedDoubleGroups = doubleGroups.slice(bottomStartIndex, bottomEndIndex)
                const pagedCoilLongGroups = coilLongGroups.slice(bottomStartIndex, bottomEndIndex)
                const pagedCoilFloatGroups = coilFloatGroups.slice(bottomStartIndex, bottomEndIndex)
                const pagedCoilDoubleGroups = coilDoubleGroups.slice(bottomStartIndex, bottomEndIndex)
                const typedSpanHints = buildTypedSpanHints(
                  new Set(group.registers.map((r) => r.address)),
                  tab.typedInterpretation
                )
                const batchAssignableStarts = getBatchAssignableAddresses(
                  tab.selectedAddresses,
                  typedBatchMode
                )
                const currentWidths = {
                  ...DEFAULT_TABLE_COLUMN_WIDTHS,
                  ...(tableColumnWidths[activeTabId] || {})
                }
                const getAutoFitWidth = (column: TableColumnKey): number => {
                  const headerText: Record<TableColumnKey, string> = {
                    interpretation: 'Interpretation',
                    display: 'Display',
                    address: 'Address',
                    variable: 'Variable Name',
                    value: 'Value',
                    comments: 'Comments'
                  }
                  const values = group.registers.map((register) => {
                    if (column === 'interpretation') {
                      return (
                        tab.typedInterpretation[register.address] ||
                        defaultTypedInterpretation
                      ).toUpperCase()
                    }
                    if (column === 'display') {
                      return (tab.registerDisplayFormat[register.address] || 'dec').toUpperCase()
                    }
                    if (column === 'address') return formatAddress(register.address)
                    if (column === 'variable') return register.variableName || 'Double-click to edit'
                    if (column === 'value') {
                      if (isCoilGroup) return register.value !== 0 ? 'ON' : 'OFF'
                      const mode = tab.registerDisplayFormat[register.address] || 'dec'
                      return formatDisplayValue(rawRegisterMap, register.address, mode)
                    }
                    return register.comment || 'Add comment...'
                  })
                  if (column === 'address') return 104
                  const maxLen = Math.max(
                    headerText[column].length,
                    ...values.map((value) => value.length),
                    6
                  )
                  const estimated = Math.round(maxLen * 8.5 + 36)
                  return Math.max(
                    MIN_TABLE_COLUMN_WIDTHS[column],
                    Math.min(estimated, 640)
                  )
                }
                const tableMinWidth =
                  56 +
                  currentWidths.interpretation +
                  currentWidths.display +
                  currentWidths.address +
                  currentWidths.variable +
                  currentWidths.value +
                  currentWidths.comments
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                    <Box
                      sx={{
                        flex: 1,
                        minHeight: MIN_TOP_PANEL_HEIGHT,
                        minWidth: 0,
                        overflow: 'hidden',
                        p: 1.5,
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1.25,
                          mb: 1,
                          flexWrap: 'wrap',
                          flexShrink: 0
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexWrap: 'wrap',
                            minHeight: 28
                          }}
                        >
                          <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.25 }}>
                            {group.name}
                          </Typography>
                          <Divider orientation="vertical" flexItem />
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            <Chip
                              label={`Type ${getRegisterTypeName(group.type)}`}
                              color="primary"
                              size="small"
                            />
                            <Chip
                              label={`Start ${formatAddress(group.startAddress)}`}
                              variant="outlined"
                              size="small"
                            />
                            <Chip label={`Count ${group.count}`} variant="outlined" size="small" />
                            <Chip label={`Conn ${conn?.alias}`} variant="outlined" size="small" />
                            <Chip label={`Slave ${slave?.alias}`} variant="outlined" size="small" />
                          </Box>
                        </Box>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<ShowChartIcon />}
                          disabled={selectedRegisters.length === 0}
                          onClick={() => {
                            if (!conn || !slave) return
                            handleOpenRegisterPlot(tab, conn, slave, group)
                          }}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          Plot ({selectedRegisters.length})
                        </Button>
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
                          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                            <TableContainer
                              component={Paper}
                              variant="outlined"
                              sx={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'auto',
                                '& .MuiTableCell-stickyHeader': {
                                  top: 0,
                                  zIndex: 2,
                                  bgcolor: 'background.paper'
                                }
                              }}
                            >
                              <Table
                                size="small"
                                stickyHeader
                                sx={{
                                  minWidth: tableMinWidth,
                                  '& .MuiTableCell-root': {
                                    py: 0.1
                                  }
                                }}
                              >
                                <TableHead>
                                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell padding="checkbox" sx={{ bgcolor: 'action.hover' }}>
                                      <Checkbox
                                        size="small"
                                        indeterminate={
                                          tab.selectedAddresses.size > 0 &&
                                          tab.selectedAddresses.size < group.count
                                        }
                                        checked={tab.selectedAddresses.size === group.count}
                                        onChange={() =>
                                          selectAllAddresses(
                                            activeTabId,
                                            allRegisterAddresses
                                          )
                                        }
                                      />
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        width: currentWidths.address,
                                        minWidth: currentWidths.address,
                                        bgcolor: 'action.hover',
                                        whiteSpace: 'nowrap',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 3,
                                        borderRight: '1px solid',
                                        borderColor: 'divider'
                                      }}
                                    >
                                      Address
                                      <Box
                                        data-testid="col-resize-address"
                                        onMouseDown={(event) => {
                                          event.preventDefault()
                                          setColumnResizeState({
                                            tabId: activeTabId,
                                            column: 'address',
                                            startX: event.clientX,
                                            startWidth: currentWidths.address
                                          })
                                        }}
                                        onDoubleClick={(event) => {
                                          event.preventDefault()
                                          setTableColumnWidths((prev) => ({
                                            ...prev,
                                            [activeTabId]: {
                                              ...prev[activeTabId],
                                              address: getAutoFitWidth('address')
                                            }
                                          }))
                                        }}
                                        sx={{
                                          position: 'absolute',
                                          top: 0,
                                          right: -2,
                                          width: 6,
                                          height: '100%',
                                          cursor: 'col-resize',
                                          zIndex: 2
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        width: currentWidths.variable,
                                        minWidth: currentWidths.variable,
                                        bgcolor: 'action.hover',
                                        whiteSpace: 'nowrap',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 3,
                                        borderRight: '1px solid',
                                        borderColor: 'divider'
                                      }}
                                    >
                                      Variable Name
                                      <Box
                                        data-testid="col-resize-variable"
                                        onMouseDown={(event) => {
                                          event.preventDefault()
                                          setColumnResizeState({
                                            tabId: activeTabId,
                                            column: 'variable',
                                            startX: event.clientX,
                                            startWidth: currentWidths.variable
                                          })
                                        }}
                                        onDoubleClick={(event) => {
                                          event.preventDefault()
                                          setTableColumnWidths((prev) => ({
                                            ...prev,
                                            [activeTabId]: {
                                              ...prev[activeTabId],
                                              variable: getAutoFitWidth('variable')
                                            }
                                          }))
                                        }}
                                        sx={{
                                          position: 'absolute',
                                          top: 0,
                                          right: -2,
                                          width: 6,
                                          height: '100%',
                                          cursor: 'col-resize',
                                          zIndex: 2
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        width: currentWidths.value,
                                        minWidth: currentWidths.value,
                                        bgcolor: 'action.hover',
                                        whiteSpace: 'nowrap',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 3,
                                        borderRight: '1px solid',
                                        borderColor: 'divider'
                                      }}
                                    >
                                      Value
                                      <Box
                                        data-testid="col-resize-value"
                                        onMouseDown={(event) => {
                                          event.preventDefault()
                                          setColumnResizeState({
                                            tabId: activeTabId,
                                            column: 'value',
                                            startX: event.clientX,
                                            startWidth: currentWidths.value
                                          })
                                        }}
                                        onDoubleClick={(event) => {
                                          event.preventDefault()
                                          setTableColumnWidths((prev) => ({
                                            ...prev,
                                            [activeTabId]: {
                                              ...prev[activeTabId],
                                              value: getAutoFitWidth('value')
                                            }
                                          }))
                                        }}
                                        sx={{
                                          position: 'absolute',
                                          top: 0,
                                          right: -2,
                                          width: 6,
                                          height: '100%',
                                          cursor: 'col-resize',
                                          zIndex: 2
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        width: currentWidths.interpretation,
                                        minWidth: currentWidths.interpretation,
                                        bgcolor: 'action.hover',
                                        whiteSpace: 'nowrap',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 3,
                                        borderRight: '1px solid',
                                        borderColor: 'divider'
                                      }}
                                    >
                                      Interpretation
                                      <Box
                                        data-testid="col-resize-type"
                                        onMouseDown={(event) => {
                                          event.preventDefault()
                                          setColumnResizeState({
                                            tabId: activeTabId,
                                            column: 'interpretation',
                                            startX: event.clientX,
                                            startWidth: currentWidths.interpretation
                                          })
                                        }}
                                        onDoubleClick={(event) => {
                                          event.preventDefault()
                                          setTableColumnWidths((prev) => ({
                                            ...prev,
                                            [activeTabId]: {
                                              ...prev[activeTabId],
                                              interpretation: getAutoFitWidth('interpretation')
                                            }
                                          }))
                                        }}
                                        sx={{
                                          position: 'absolute',
                                          top: 0,
                                          right: -2,
                                          width: 6,
                                          height: '100%',
                                          cursor: 'col-resize',
                                          zIndex: 2
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        width: currentWidths.display,
                                        minWidth: currentWidths.display,
                                        bgcolor: 'action.hover',
                                        whiteSpace: 'nowrap',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 3,
                                        borderRight: '1px solid',
                                        borderColor: 'divider'
                                      }}
                                    >
                                      Display
                                      <Box
                                        data-testid="col-resize-display"
                                        onMouseDown={(event) => {
                                          event.preventDefault()
                                          setColumnResizeState({
                                            tabId: activeTabId,
                                            column: 'display',
                                            startX: event.clientX,
                                            startWidth: currentWidths.display
                                          })
                                        }}
                                        onDoubleClick={(event) => {
                                          event.preventDefault()
                                          setTableColumnWidths((prev) => ({
                                            ...prev,
                                            [activeTabId]: {
                                              ...prev[activeTabId],
                                              display: getAutoFitWidth('display')
                                            }
                                          }))
                                        }}
                                        sx={{
                                          position: 'absolute',
                                          top: 0,
                                          right: -2,
                                          width: 6,
                                          height: '100%',
                                          cursor: 'col-resize',
                                          zIndex: 2
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: 'bold',
                                        bgcolor: 'action.hover',
                                        width: currentWidths.comments,
                                        minWidth: currentWidths.comments,
                                        whiteSpace: 'nowrap',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 3,
                                        borderRight: '1px solid',
                                        borderColor: 'divider'
                                      }}
                                    >
                                      Comments
                                      <Box
                                        data-testid="col-resize-comments"
                                        onMouseDown={(event) => {
                                          event.preventDefault()
                                          setColumnResizeState({
                                            tabId: activeTabId,
                                            column: 'comments',
                                            startX: event.clientX,
                                            startWidth: currentWidths.comments
                                          })
                                        }}
                                        onDoubleClick={(event) => {
                                          event.preventDefault()
                                          setTableColumnWidths((prev) => ({
                                            ...prev,
                                            [activeTabId]: {
                                              ...prev[activeTabId],
                                              comments: getAutoFitWidth('comments')
                                            }
                                          }))
                                        }}
                                        sx={{
                                          position: 'absolute',
                                          top: 0,
                                          right: -2,
                                          width: 6,
                                          height: '100%',
                                          cursor: 'col-resize',
                                          zIndex: 2
                                        }}
                                      />
                                    </TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {paginatedRegisters.map((register, rowIndex) => {
                                    const isCoilGroup = group.type === '01' || group.type === '02'
                                    const isSelected = tab.selectedAddresses.has(register.address)
                                    const typedSpanHint = typedSpanHints.get(register.address)
                                    const explicitMode = tab.typedInterpretation[register.address]
                                    const effectiveTypedSpanHint =
                                      explicitMode && typedSpanHint && explicitMode !== typedSpanHint.mode
                                        ? undefined
                                        : typedSpanHint
                                    const currentTypedMode =
                                      explicitMode ||
                                      effectiveTypedSpanHint?.mode ||
                                      defaultTypedInterpretation
                                    const interpretationColor = INTERPRETATION_COLORS[currentTypedMode]
                                    const currentDisplayMode =
                                      tab.registerDisplayFormat[register.address] || 'dec'
                                    const displayWordSpan = getDisplayWordSpan(currentDisplayMode)
                                    return (
                                      <TableRow
                                        key={register.address}
                                        selected={isSelected}
                                        hover
                                        onContextMenu={(event) => {
                                          if (isCoilGroup) {
                                            event.preventDefault()
                                            return
                                          }
                                          if (!isSelected) {
                                            updateTab(activeTabId, {
                                              selectedAddresses: new Set([register.address])
                                            })
                                          }
                                          handleOpenTypedBatchMenu(event, activeTabId)
                                        }}
                                        onClick={(e) =>
                                          toggleAddressSelection(
                                            activeTabId,
                                            register.address,
                                            e.ctrlKey || e.metaKey,
                                            e.shiftKey,
                                            allRegisterAddresses
                                          )
                                        }
                                        sx={(theme) => ({
                                          cursor: 'pointer',
                                          bgcolor:
                                            rowIndex % 2 === 1
                                              ? alpha(theme.palette.action.hover, 0.1)
                                              : 'transparent'
                                        })}
                                      >
                                        <TableCell padding="checkbox">
                                          <Checkbox size="small" checked={isSelected} />
                                        </TableCell>
                                        <TableCell
                                          sx={{
                                            fontFamily: MONO_FONT_FAMILY,
                                            fontWeight: 'bold',
                                            width: currentWidths.address,
                                            minWidth: currentWidths.address,
                                            whiteSpace: 'nowrap',
                                            borderRight: '1px solid',
                                            borderColor: 'divider'
                                          }}
                                        >
                                          {formatAddress(register.address)}
                                        </TableCell>
                                        <TableCell
                                          sx={{
                                            width: currentWidths.variable,
                                            minWidth: currentWidths.variable,
                                            borderRight: '1px solid',
                                            borderColor: 'divider'
                                          }}
                                        >
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
                                        <TableCell
                                          data-testid={`value-cell-${register.address}`}
                                          sx={(theme) => ({
                                            bgcolor:
                                              theme.palette.mode === 'dark'
                                                ? alpha(interpretationColor.border, 0.26)
                                                : interpretationColor.bg,
                                            color:
                                              theme.palette.mode === 'dark'
                                                ? 'text.primary'
                                                : interpretationColor.fg,
                                            width: currentWidths.value,
                                            minWidth: currentWidths.value,
                                            borderRight: '1px solid',
                                            borderColor: 'divider'
                                          })}
                                        >
                                          {isCoilGroup ? (
                                            <Typography
                                              variant="body2"
                                              sx={{
                                                fontFamily: MONO_FONT_FAMILY,
                                                fontSize: MONO_FONT_SIZE,
                                                fontWeight: 700,
                                                color: 'inherit'
                                              }}
                                            >
                                              {register.value !== 0 ? 'ON' : 'OFF'}
                                            </Typography>
                                          ) : (
                                            (() => {
                                              const isEditing =
                                                inlineValueEditCell?.tabId === activeTabId &&
                                                inlineValueEditCell?.address === register.address
                                              if (isEditing && inlineValueEditCell) {
                                                return (
                                                  <TextField
                                                    autoFocus
                                                    size="small"
                                                    variant="standard"
                                                    value={inlineValueEditCell.draft}
                                                    error={inlineValueEditCell.hasError}
                                                    onClick={(event) => event.stopPropagation()}
                                                    onChange={(event) =>
                                                      setInlineValueEditCell((prev) =>
                                                        prev &&
                                                        prev.tabId === activeTabId &&
                                                        prev.address === register.address
                                                          ? {
                                                              ...prev,
                                                              draft: event.target.value,
                                                              hasError: false
                                                            }
                                                          : prev
                                                      )
                                                    }
                                                    onBlur={() => {
                                                      const parsed = parseAutoRadixRegisterInput(
                                                        inlineValueEditCell.draft
                                                      )
                                                      if (parsed === null) {
                                                        setInlineValueEditCell((prev) =>
                                                          prev &&
                                                          prev.tabId === activeTabId &&
                                                          prev.address === register.address
                                                            ? { ...prev, hasError: true }
                                                            : prev
                                                        )
                                                        showUserError('Invalid register value.')
                                                        return
                                                      }
                                                      updateRegister(
                                                        tab.connectionId,
                                                        tab.slaveId,
                                                        tab.registerGroupId,
                                                        register.address,
                                                        { value: parsed }
                                                      )
                                                      setInlineValueEditCell(null)
                                                    }}
                                                    onKeyDown={(event) => {
                                                      if (event.key === 'Escape') {
                                                        setInlineValueEditCell(null)
                                                        return
                                                      }
                                                      if (event.key !== 'Enter') return
                                                      event.preventDefault()
                                                      const parsed = parseAutoRadixRegisterInput(
                                                        inlineValueEditCell.draft
                                                      )
                                                      if (parsed === null) {
                                                        setInlineValueEditCell((prev) =>
                                                          prev &&
                                                          prev.tabId === activeTabId &&
                                                          prev.address === register.address
                                                            ? { ...prev, hasError: true }
                                                            : prev
                                                        )
                                                        showUserError('Invalid register value.')
                                                        return
                                                      }
                                                      updateRegister(
                                                        tab.connectionId,
                                                        tab.slaveId,
                                                        tab.registerGroupId,
                                                        register.address,
                                                        { value: parsed }
                                                      )
                                                      setInlineValueEditCell(null)
                                                    }}
                                                    inputProps={{
                                                      style: {
                                                        fontFamily: MONO_FONT_FAMILY,
                                                        fontWeight: 700,
                                                        fontSize: MONO_FONT_SIZE
                                                      }
                                                    }}
                                                    sx={{
                                                      width: '100%',
                                                      mt: -0.25,
                                                      '& .MuiInputBase-root': {
                                                        fontSize: MONO_FONT_SIZE,
                                                        lineHeight: 1.43
                                                      }
                                                    }}
                                                  />
                                                )
                                              }

                                              return (
                                                <Typography
                                                  variant="body2"
                                                  onDoubleClick={(event) => {
                                                    event.stopPropagation()
                                                    setInlineValueEditCell({
                                                      tabId: activeTabId,
                                                      address: register.address,
                                                      draft: formatDisplayValue(
                                                        rawRegisterMap,
                                                        register.address,
                                                        currentDisplayMode
                                                      ),
                                                      hasError: false
                                                    })
                                                  }}
                                                  sx={{
                                                    fontFamily: MONO_FONT_FAMILY,
                                                    fontSize: MONO_FONT_SIZE,
                                                    fontWeight: 700,
                                                    color: 'inherit',
                                                    cursor: 'text'
                                                  }}
                                                >
                                                  {formatDisplayValue(
                                                    rawRegisterMap,
                                                    register.address,
                                                    currentDisplayMode
                                                  )}
                                                </Typography>
                                              )
                                            })()
                                          )}
                                        </TableCell>
                                        <TableCell
                                          sx={{
                                            width: currentWidths.interpretation,
                                            minWidth: currentWidths.interpretation,
                                            whiteSpace: 'nowrap',
                                            borderRight: '1px solid',
                                            borderColor: 'divider'
                                          }}
                                        >
                                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
                                            <Chip
                                              size="small"
                                              variant="filled"
                                              data-testid={`value-format-${register.address}`}
                                              label={
                                                isCoilGroup
                                                  ? 'BIT (1b)'
                                                  : `${currentTypedMode.toUpperCase()} (${getWordSpanForInterpretation(
                                                      currentTypedMode
                                                    )}w)`
                                              }
                                              sx={{
                                                fontWeight: 700,
                                                height: 20,
                                                bgcolor: isCoilGroup
                                                  ? 'action.selected'
                                                  : INTERPRETATION_COLORS[currentTypedMode].bg,
                                                color: isCoilGroup
                                                  ? 'text.primary'
                                                  : INTERPRETATION_COLORS[currentTypedMode].fg,
                                                border: '1px solid',
                                                borderColor: isCoilGroup
                                                  ? 'divider'
                                                  : INTERPRETATION_COLORS[currentTypedMode].border
                                              }}
                                              onClick={(event) => {
                                                if (isCoilGroup) return
                                                event.stopPropagation()
                                                if (!isSelected) {
                                                  updateTab(activeTabId, {
                                                    selectedAddresses: new Set([register.address])
                                                  })
                                                }
                                                handleOpenTypedValueEditMenu(
                                                  event,
                                                  activeTabId,
                                                  register.address
                                                )
                                              }}
                                            />
                                            {!isCoilGroup && effectiveTypedSpanHint ? (
                                              <Box
                                                sx={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: 0.4,
                                                  color: 'text.secondary'
                                                }}
                                              >
                                                <LinkIcon sx={{ fontSize: 12 }} />
                                                <Typography variant="caption">
                                                  {effectiveTypedSpanHint.index === 0
                                                    ? `${formatAddress(
                                                        effectiveTypedSpanHint.startAddress
                                                      )} x${effectiveTypedSpanHint.span}`
                                                    : `↳ ${formatAddress(
                                                        effectiveTypedSpanHint.startAddress
                                                      )}`}
                                                </Typography>
                                              </Box>
                                            ) : null}
                                          </Box>
                                        </TableCell>
                                        <TableCell
                                          sx={{
                                            width: currentWidths.display,
                                            minWidth: currentWidths.display,
                                            whiteSpace: 'nowrap',
                                            borderRight: '1px solid',
                                            borderColor: 'divider'
                                          }}
                                        >
                                          <Chip
                                            size="small"
                                            variant="filled"
                                            data-testid={`display-format-${register.address}`}
                                            label={isCoilGroup ? 'BYTE (8b)' : `${currentDisplayMode.toUpperCase()} (${displayWordSpan}w)`}
                                            sx={{
                                              fontWeight: 700,
                                              height: 20,
                                              bgcolor: isCoilGroup
                                                ? 'action.selected'
                                                : DISPLAY_COLORS[currentDisplayMode].bg,
                                              color: isCoilGroup
                                                ? 'text.primary'
                                                : DISPLAY_COLORS[currentDisplayMode].fg,
                                              border: '1px solid',
                                              borderColor: isCoilGroup
                                                ? 'divider'
                                                : DISPLAY_COLORS[currentDisplayMode].border
                                            }}
                                            onClick={(event) => {
                                              if (isCoilGroup) return
                                              handleOpenDisplayFormatMenu(
                                                event,
                                                activeTabId,
                                                register.address
                                              )
                                            }}
                                          />
                                        </TableCell>
                                        <TableCell
                                          sx={{
                                            width: currentWidths.comments,
                                            minWidth: currentWidths.comments,
                                            borderRight: '1px solid',
                                            borderColor: 'divider'
                                          }}
                                        >
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
                                startTableTransition(() =>
                                  setTablePagination((prev) => ({
                                    ...prev,
                                    [paginationKey]: { ...pagination, page: newPage }
                                  }))
                                )
                              }
                              rowsPerPage={pagination.rowsPerPage}
                              onRowsPerPageChange={(e) =>
                                startTableTransition(() =>
                                  setTablePagination((prev) => ({
                                    ...prev,
                                    [paginationKey]: {
                                      ...pagination,
                                      page: 0,
                                      rowsPerPage: parseInt(e.target.value, 10)
                                    }
                                  }))
                                )
                              }
                              rowsPerPageOptions={[25, 50, 100, 200, 500]}
                            />
                          </Box>
                        )
                      })()}
                    </Box>

                    {!isCoilGroup ? (
                      <Box
                        sx={{
                          px: 1.5,
                          pb: 1,
                          pt: 0.25,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          flexWrap: 'wrap',
                          borderTop: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper'
                        }}
                      >
                        <Typography variant="subtitle2" sx={{ minWidth: 180 }}>
                          Set Display For Selection
                        </Typography>
                        <FormControl size="small" sx={{ minWidth: 170 }}>
                          <InputLabel>Type</InputLabel>
                          <Select
                            label="Type"
                            value={typedBatchMode}
                            onChange={(event) =>
                              setTypedBatchMode(event.target.value as PlotInterpretation)
                            }
                          >
                            {TYPED_INTERPRETATION_OPTIONS.map((opt) => (
                              <MenuItem key={`type-batch-${opt}`} value={opt}>
                                {opt.toUpperCase()} ({getWordSpanForInterpretation(opt)}w)
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={batchAssignableStarts.length === 0}
                          data-testid="typed-batch-apply"
                          onClick={() => void applyTypedInterpretationToSelection(activeTabId, typedBatchMode)}
                        >
                          Apply Type To {batchAssignableStarts.length}
                        </Button>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                          <InputLabel>Display</InputLabel>
                          <Select
                            label="Display"
                            value={displayBatchMode}
                            onChange={(event) =>
                              setDisplayBatchMode(event.target.value as RegisterDisplayFormat)
                            }
                          >
                            {DISPLAY_FORMAT_OPTIONS.map((opt) => (
                              <MenuItem key={`display-batch-${opt.mode}`} value={opt.mode}>
                                {opt.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={tab.selectedAddresses.size === 0}
                          data-testid="display-batch-apply"
                          onClick={() =>
                            void applyDisplayFormatToSelection(activeTabId, displayBatchMode)
                          }
                        >
                          Apply To {tab.selectedAddresses.size} Selected
                        </Button>
                      </Box>
                    ) : null}

                    <Box
                      data-testid="server-bottom-splitter"
                      role="separator"
                      aria-orientation="horizontal"
                      onMouseDown={(event) =>
                        setLayoutResizeState({
                          type: 'bottom',
                          startY: event.clientY,
                          startHeight: bottomPanelHeight
                        })
                      }
                      sx={{
                        height: 6,
                        cursor: 'row-resize',
                        bgcolor: 'transparent',
                        borderTop: '1px solid',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        transition: 'background-color 120ms ease',
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    />

                    {/* Bottom Edit Panel */}
                    <Paper
                      sx={{
                        height: bottomPanelHeight,
                        minHeight: MIN_BOTTOM_PANEL_HEIGHT,
                        maxHeight: '75%',
                        flex: '0 0 auto',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                      }}
                    >
                      <Tabs
                        value={effectiveInterpretationTab}
                        onChange={(_, value) =>
                          startTableTransition(() =>
                            updateTab(activeTabId, { interpretationTab: value })
                          )
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
                      <Box
                        sx={{
                          flex: 1,
                          p: 2,
                          overflow: 'hidden',
                          contain: 'layout paint size',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: 0
                        }}
                      >
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
                        ) : (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1, minHeight: 0 }}>
                            {effectiveInterpretationTab === 'string' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Typography variant="subtitle2">Global String Encoding:</Typography>
                                <Select
                                  value={globalEncoding}
                                  onChange={(e) => setGlobalStringEncodingPreference(e.target.value as string)}
                                  size="small"
                                  sx={{ minWidth: 150 }}
                                >
                                  {GLOBAL_STRING_ENCODING_OPTIONS.map((enc) => (
                                    <MenuItem key={enc} value={enc}>
                                      {enc}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </Box>
                            ) : null}

                            <TableContainer
                              component={Paper}
                              variant="outlined"
                              sx={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'auto',
                                '& .MuiTableCell-stickyHeader': {
                                  top: 0,
                                  zIndex: 2,
                                  bgcolor: 'background.paper'
                                }
                              }}
                            >
                              <Table size="small" stickyHeader>
                                <TableHead>
                                  {effectiveInterpretationTab === 'basic' ? (
                                    <TableRow>
                                      <TableCell>Address</TableCell>
                                      {group.type === '01' || group.type === '02' ? (
                                        <>
                                          <TableCell>State</TableCell>
                                          <TableCell>Unsigned</TableCell>
                                          <TableCell>Hex</TableCell>
                                          <TableCell>Binary</TableCell>
                                          <TableCell>Octal</TableCell>
                                        </>
                                      ) : (
                                        <>
                                          <TableCell>Signed</TableCell>
                                          <TableCell>Unsigned</TableCell>
                                          <TableCell>Hex</TableCell>
                                          <TableCell>Binary</TableCell>
                                          <TableCell>Octal</TableCell>
                                        </>
                                      )}
                                    </TableRow>
                                  ) : effectiveInterpretationTab === 'long' ? (
                                    <TableRow>
                                      <TableCell>Address Range</TableCell>
                                      <TableCell>ABCD</TableCell>
                                      <TableCell>CDAB</TableCell>
                                      <TableCell>BADC</TableCell>
                                      <TableCell>DCBA</TableCell>
                                    </TableRow>
                                  ) : effectiveInterpretationTab === 'float' ? (
                                    <TableRow>
                                      <TableCell>Address Range</TableCell>
                                      <TableCell>ABCD</TableCell>
                                      <TableCell>CDAB</TableCell>
                                      <TableCell>BADC</TableCell>
                                      <TableCell>DCBA</TableCell>
                                    </TableRow>
                                  ) : effectiveInterpretationTab === 'double' ? (
                                    <TableRow>
                                      <TableCell>Address Range</TableCell>
                                      <TableCell>ABCDEFGH</TableCell>
                                      <TableCell>GHEFCDAB</TableCell>
                                      <TableCell>BADCFEHG</TableCell>
                                      <TableCell>HGFEDCBA</TableCell>
                                    </TableRow>
                                  ) : (
                                    <TableRow>
                                      <TableCell>Address</TableCell>
                                      <TableCell>String Chars</TableCell>
                                    </TableRow>
                                  )}
                                </TableHead>
                                <TableBody>
                                  {effectiveInterpretationTab === 'basic'
                                    ? pagedPanelRegisters.map((reg) => {
                                        const isCoilGroup = group.type === '01' || group.type === '02'
                                        const renderBasicCell = (format: BasicValueFormat): JSX.Element => {
                                          const isEditing =
                                            basicEditCell?.address === reg.address &&
                                            basicEditCell.format === format
                                          if (!isEditing) {
                                            return (
                                              <TableCell>
                                                <Typography
                                                  variant="body2"
                                                  sx={{
                                                    fontFamily: MONO_FONT_FAMILY,
                                                    fontWeight: 700,
                                                    cursor: 'text'
                                                  }}
                                                  onClick={(event) => {
                                                    event.stopPropagation()
                                                    setBasicEditCell({
                                                      address: reg.address,
                                                      format,
                                                      draft: formatBasicValue(reg.value, format),
                                                      hasError: false
                                                    })
                                                  }}
                                                >
                                                  {formatBasicValue(reg.value, format)}
                                                </Typography>
                                              </TableCell>
                                            )
                                          }

                                          return (
                                            <TableCell>
                                              <TextField
                                                autoFocus
                                                size="small"
                                                value={basicEditCell.draft}
                                                error={basicEditCell.hasError}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={(event) =>
                                                  setBasicEditCell((prev) =>
                                                    prev &&
                                                    prev.address === reg.address &&
                                                    prev.format === format
                                                      ? {
                                                          ...prev,
                                                          draft: event.target.value,
                                                          hasError: false
                                                        }
                                                      : prev
                                                  )
                                                }
                                                onBlur={() => {
                                                  const parsed = parseBasicValueInput(
                                                    basicEditCell.draft,
                                                    format
                                                  )
                                                  if (parsed === null) {
                                                    setBasicEditCell((prev) =>
                                                      prev &&
                                                      prev.address === reg.address &&
                                                      prev.format === format
                                                        ? { ...prev, hasError: true }
                                                        : prev
                                                    )
                                                    showUserError('Invalid input or out of range.')
                                                    return
                                                  }
                                                  updateRegister(
                                                    tab.connectionId,
                                                    tab.slaveId,
                                                    tab.registerGroupId,
                                                    reg.address,
                                                    { value: parsed }
                                                  )
                                                  setBasicEditCell(null)
                                                }}
                                                onKeyDown={(event) => {
                                                  if (event.key === 'Enter') {
                                                    event.preventDefault()
                                                    const parsed = parseBasicValueInput(
                                                      basicEditCell.draft,
                                                      format
                                                    )
                                                    if (parsed === null) {
                                                      setBasicEditCell((prev) =>
                                                        prev &&
                                                        prev.address === reg.address &&
                                                        prev.format === format
                                                          ? { ...prev, hasError: true }
                                                          : prev
                                                      )
                                                      showUserError('Invalid input or out of range.')
                                                      return
                                                    }
                                                    updateRegister(
                                                      tab.connectionId,
                                                      tab.slaveId,
                                                      tab.registerGroupId,
                                                      reg.address,
                                                      { value: parsed }
                                                    )
                                                    setBasicEditCell(null)
                                                  }
                                                  if (event.key === 'Escape') {
                                                    event.preventDefault()
                                                    setBasicEditCell(null)
                                                  }
                                                }}
                                                inputProps={{
                                                  'data-testid': `basic-${format}-${reg.address}`,
                                                  style: {
                                                    textAlign: 'center',
                                                    fontFamily: MONO_FONT_FAMILY,
                                                    fontWeight: 700
                                                  }
                                                }}
                                                type={
                                                  format === 'signed' || format === 'unsigned'
                                                    ? 'number'
                                                    : 'text'
                                                }
                                                sx={{
                                                  minWidth: 90,
                                                  '& .MuiInputBase-input': { py: 0.25, fontSize: 12.5 }
                                                }}
                                              />
                                            </TableCell>
                                          )
                                        }

                                        return (
                                          <TableRow key={reg.address}>
                                            <TableCell sx={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 700 }}>
                                              {formatAddress(reg.address)}
                                            </TableCell>
                                            {isCoilGroup ? (
                                              <>
                                                <TableCell>
                                                  {group.type === '01' ? (
                                                    <Switch
                                                      size="small"
                                                      checked={reg.value !== 0}
                                                      onChange={(event) =>
                                                        updateRegister(
                                                          tab.connectionId,
                                                          tab.slaveId,
                                                          tab.registerGroupId,
                                                          reg.address,
                                                          { value: event.target.checked ? 1 : 0 }
                                                        )
                                                      }
                                                    />
                                                  ) : (
                                                    <Typography
                                                      variant="body2"
                                                      sx={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 700 }}
                                                    >
                                                      {reg.value !== 0 ? 'ON' : 'OFF'}
                                                    </Typography>
                                                  )}
                                                </TableCell>
                                                {(['unsigned', 'hex', 'bin', 'oct'] as const).map((fmt) => {
                                                  const isEditing =
                                                    basicEditCell?.address === reg.address &&
                                                    basicEditCell.format === fmt
                                                  if (!isEditing) {
                                                    const display =
                                                      fmt === 'unsigned'
                                                        ? String(reg.value !== 0 ? 1 : 0)
                                                        : fmt === 'hex'
                                                          ? `0x${reg.value !== 0 ? '1' : '0'}`
                                                          : fmt === 'bin'
                                                            ? `0b${reg.value !== 0 ? '1' : '0'}`
                                                            : `0o${reg.value !== 0 ? '1' : '0'}`
                                                    return (
                                                      <TableCell key={`coil-basic-${fmt}-${reg.address}`}>
                                                        <Typography
                                                          variant="body2"
                                                          sx={{
                                                            fontFamily: MONO_FONT_FAMILY,
                                                            fontWeight: 700,
                                                            cursor: group.type === '01' ? 'text' : 'default'
                                                          }}
                                                          onClick={(event) => {
                                                            if (group.type !== '01') return
                                                            event.stopPropagation()
                                                            setBasicEditCell({
                                                              address: reg.address,
                                                              format: fmt,
                                                              draft: fmt === 'unsigned' ? String(reg.value !== 0 ? 1 : 0) : display,
                                                              hasError: false
                                                            })
                                                          }}
                                                        >
                                                          {display}
                                                        </Typography>
                                                      </TableCell>
                                                    )
                                                  }
                                                  return (
                                                    <TableCell key={`coil-basic-edit-${fmt}-${reg.address}`}>
                                                      <TextField
                                                        autoFocus
                                                        size="small"
                                                        value={basicEditCell.draft}
                                                        error={basicEditCell.hasError}
                                                        onClick={(event) => event.stopPropagation()}
                                                        onChange={(event) =>
                                                          setBasicEditCell((prev) =>
                                                            prev &&
                                                            prev.address === reg.address &&
                                                            prev.format === fmt
                                                              ? {
                                                                  ...prev,
                                                                  draft: event.target.value,
                                                                  hasError: false
                                                                }
                                                              : prev
                                                          )
                                                        }
                                                        onBlur={() => {
                                                          const parsed = parseCoilBitInput(
                                                            basicEditCell.draft,
                                                            fmt
                                                          )
                                                          if (parsed === null) {
                                                            setBasicEditCell((prev) =>
                                                              prev &&
                                                              prev.address === reg.address &&
                                                              prev.format === fmt
                                                                ? { ...prev, hasError: true }
                                                                : prev
                                                            )
                                                            showUserError('Coil value must be 0 or 1.')
                                                            return
                                                          }
                                                          updateRegister(
                                                            tab.connectionId,
                                                            tab.slaveId,
                                                            tab.registerGroupId,
                                                            reg.address,
                                                            { value: parsed }
                                                          )
                                                          setBasicEditCell(null)
                                                        }}
                                                        onKeyDown={(event) => {
                                                          if (event.key === 'Enter') {
                                                            event.preventDefault()
                                                            const parsed = parseCoilBitInput(
                                                              basicEditCell.draft,
                                                              fmt
                                                            )
                                                            if (parsed === null) {
                                                              setBasicEditCell((prev) =>
                                                                prev &&
                                                                prev.address === reg.address &&
                                                                prev.format === fmt
                                                                  ? { ...prev, hasError: true }
                                                                  : prev
                                                              )
                                                              showUserError('Coil value must be 0 or 1.')
                                                              return
                                                            }
                                                            updateRegister(
                                                              tab.connectionId,
                                                              tab.slaveId,
                                                              tab.registerGroupId,
                                                              reg.address,
                                                              { value: parsed }
                                                            )
                                                            setBasicEditCell(null)
                                                          }
                                                          if (event.key === 'Escape') {
                                                            event.preventDefault()
                                                            setBasicEditCell(null)
                                                          }
                                                        }}
                                                        inputProps={{
                                                          'data-testid': `basic-${fmt}-${reg.address}`,
                                                          style: {
                                                            textAlign: 'center',
                                                            fontFamily: MONO_FONT_FAMILY,
                                                            fontWeight: 700
                                                          }
                                                        }}
                                                        type={fmt === 'unsigned' ? 'number' : 'text'}
                                                        sx={{
                                                          minWidth: 90,
                                                          '& .MuiInputBase-input': {
                                                            py: 0.25,
                                                            fontSize: 12.5
                                                          }
                                                        }}
                                                      />
                                                    </TableCell>
                                                  )
                                                })}
                                              </>
                                            ) : (
                                              <>
                                                {renderBasicCell('signed')}
                                                {renderBasicCell('unsigned')}
                                                {renderBasicCell('hex')}
                                                {renderBasicCell('bin')}
                                                {renderBasicCell('oct')}
                                              </>
                                            )}
                                          </TableRow>
                                        )
                                      })
                                    : effectiveInterpretationTab === 'long'
                                      ? isCoilGroup
                                        ? pagedCoilLongGroups.map((groupItem, idx) => {
                                            const pair: Register[] = [
                                              { address: 0, value: groupItem.words[0], variableName: '', comment: '' },
                                              { address: 1, value: groupItem.words[1], variableName: '', comment: '' }
                                            ]
                                            const start = groupItem.startBit
                                            return (
                                              <TableRow key={`coil-long-${idx}`}>
                                                <TableCell sx={{ fontFamily: MONO_FONT_FAMILY }}>
                                                  {formatAddress(groupItem.startBit)} - {formatAddress(groupItem.endBit)}
                                                </TableCell>
                                                {(['ABCD', 'CDAB', 'BADC', 'DCBA'] as const).map((order) => {
                                                  const value = registersToUint32(pair, order)
                                                  const isEditing =
                                                    conversionEditCell?.tab === 'long' &&
                                                    conversionEditCell.start === start &&
                                                    conversionEditCell.order === order
                                                  if (!isEditing) {
                                                    return (
                                                      <TableCell key={`coil-long-${start}-${order}`}>
                                                        <Typography
                                                          variant="body2"
                                                          sx={{
                                                            fontFamily: MONO_FONT_FAMILY,
                                                            fontWeight: 700,
                                                            cursor: group.type === '01' ? 'text' : 'default'
                                                          }}
                                                          onClick={() => {
                                                            if (group.type !== '01') return
                                                            setConversionEditCell({
                                                              tab: 'long',
                                                              start,
                                                              order,
                                                              draft: String(value),
                                                              hasError: false
                                                            })
                                                          }}
                                                        >
                                                          {value}
                                                        </Typography>
                                                      </TableCell>
                                                    )
                                                  }
                                                  return (
                                                    <TableCell key={`coil-long-edit-${start}-${order}`}>
                                                      <TextField
                                                        autoFocus
                                                        size="small"
                                                        value={conversionEditCell.draft}
                                                        error={conversionEditCell.hasError}
                                                        onChange={(event) =>
                                                          setConversionEditCell((prev) =>
                                                            prev &&
                                                            prev.tab === 'long' &&
                                                            prev.start === start &&
                                                            prev.order === order
                                                              ? {
                                                                  ...prev,
                                                                  draft: event.target.value,
                                                                  hasError: false
                                                                }
                                                              : prev
                                                          )
                                                        }
                                                        onBlur={() => {
                                                          const n = Number(conversionEditCell.draft)
                                                          if (
                                                            !Number.isFinite(n) ||
                                                            n < 0 ||
                                                            n > 0xffffffff
                                                          ) {
                                                            setConversionEditCell((prev) =>
                                                              prev &&
                                                              prev.tab === 'long' &&
                                                              prev.start === start &&
                                                              prev.order === order
                                                                ? { ...prev, hasError: true }
                                                                : prev
                                                            )
                                                            return
                                                          }
                                                          const words = uint32ToRegisters(Math.round(n), order)
                                                          updateRegistersBatch(
                                                            tab.connectionId,
                                                            tab.slaveId,
                                                            tab.registerGroupId,
                                                            wordsToCoilBitMap(start, [...words])
                                                          )
                                                          setConversionEditCell(null)
                                                        }}
                                                        onKeyDown={(event) => {
                                                          if (event.key === 'Escape') {
                                                            setConversionEditCell(null)
                                                          }
                                                          if (event.key === 'Enter') {
                                                            ;(event.target as HTMLInputElement).blur()
                                                          }
                                                        }}
                                                        inputProps={{ style: { fontFamily: MONO_FONT_FAMILY } }}
                                                      />
                                                    </TableCell>
                                                  )
                                                })}
                                              </TableRow>
                                            )
                                          })
                                        : pagedLongGroups.map((pair, idx) => (
                                            <TableRow key={`long-${idx}`}>
                                              <TableCell sx={{ fontFamily: MONO_FONT_FAMILY }}>
                                                {formatAddress(pair[0].address)} - {formatAddress(pair[1].address)}
                                              </TableCell>
                                              {(['ABCD', 'CDAB', 'BADC', 'DCBA'] as const).map((order) => {
                                                const value = registersToUint32(pair, order)
                                                const start = pair[0].address
                                                const isEditing =
                                                  conversionEditCell?.tab === 'long' &&
                                                  conversionEditCell.start === start &&
                                                  conversionEditCell.order === order
                                                if (!isEditing) {
                                                  return (
                                                    <TableCell key={`long-${start}-${order}`}>
                                                      <Typography
                                                        variant="body2"
                                                        sx={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 700, cursor: 'text' }}
                                                        onClick={() =>
                                                          setConversionEditCell({
                                                            tab: 'long',
                                                            start,
                                                            order,
                                                            draft: String(value),
                                                            hasError: false
                                                          })
                                                        }
                                                      >
                                                        {value}
                                                      </Typography>
                                                    </TableCell>
                                                  )
                                                }
                                                return (
                                                  <TableCell key={`long-edit-${start}-${order}`}>
                                                    <TextField
                                                      autoFocus
                                                      size="small"
                                                      value={conversionEditCell.draft}
                                                      error={conversionEditCell.hasError}
                                                      onChange={(event) =>
                                                        setConversionEditCell((prev) =>
                                                          prev &&
                                                          prev.tab === 'long' &&
                                                          prev.start === start &&
                                                          prev.order === order
                                                            ? {
                                                                ...prev,
                                                                draft: event.target.value,
                                                                hasError: false
                                                              }
                                                            : prev
                                                        )
                                                      }
                                                      onBlur={() => {
                                                        const n = Number(conversionEditCell.draft)
                                                        if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) {
                                                          setConversionEditCell((prev) =>
                                                            prev &&
                                                            prev.tab === 'long' &&
                                                            prev.start === start &&
                                                            prev.order === order
                                                              ? { ...prev, hasError: true }
                                                              : prev
                                                          )
                                                          showUserError('Long value must be between 0 and 4294967295.')
                                                          return
                                                        }
                                                        const words = uint32ToRegisters(Math.round(n), order)
                                                        updateRegistersBatch(
                                                          tab.connectionId,
                                                          tab.slaveId,
                                                          tab.registerGroupId,
                                                          {
                                                            [start]: words[0],
                                                            [start + 1]: words[1]
                                                          }
                                                        )
                                                        setConversionEditCell(null)
                                                      }}
                                                      onKeyDown={(event) => {
                                                        if (event.key === 'Escape') setConversionEditCell(null)
                                                        if (event.key === 'Enter') {
                                                          ;(event.target as HTMLInputElement).blur()
                                                        }
                                                      }}
                                                      inputProps={{ style: { fontFamily: MONO_FONT_FAMILY } }}
                                                    />
                                                  </TableCell>
                                                )
                                              })}
                                            </TableRow>
                                          ))
                                      : effectiveInterpretationTab === 'float'
                                        ? isCoilGroup
                                          ? pagedCoilFloatGroups.map((groupItem, idx) => {
                                              const pair: Register[] = [
                                                { address: 0, value: groupItem.words[0], variableName: '', comment: '' },
                                                { address: 1, value: groupItem.words[1], variableName: '', comment: '' }
                                              ]
                                              const start = groupItem.startBit
                                              return (
                                                <TableRow key={`coil-float-${idx}`}>
                                                  <TableCell sx={{ fontFamily: MONO_FONT_FAMILY }}>
                                                    {formatAddress(groupItem.startBit)} - {formatAddress(groupItem.endBit)}
                                                  </TableCell>
                                                  {(['ABCD', 'CDAB', 'BADC', 'DCBA'] as const).map((order) => {
                                                    const value = registersToFloat32(pair, order)
                                                    const isEditing =
                                                      conversionEditCell?.tab === 'float' &&
                                                      conversionEditCell.start === start &&
                                                      conversionEditCell.order === order
                                                    if (!isEditing) {
                                                      return (
                                                        <TableCell key={`coil-float-${start}-${order}`}>
                                                          <Typography
                                                            variant="body2"
                                                            sx={{
                                                              fontFamily: MONO_FONT_FAMILY,
                                                              fontWeight: 700,
                                                              cursor: group.type === '01' ? 'text' : 'default'
                                                            }}
                                                            onClick={() => {
                                                              if (group.type !== '01') return
                                                              setConversionEditCell({
                                                                tab: 'float',
                                                                start,
                                                                order,
                                                                draft: String(value),
                                                                hasError: false
                                                              })
                                                            }}
                                                          >
                                                            {value.toPrecision(7)}
                                                          </Typography>
                                                        </TableCell>
                                                      )
                                                    }
                                                    return (
                                                      <TableCell key={`coil-float-edit-${start}-${order}`}>
                                                        <TextField
                                                          autoFocus
                                                          size="small"
                                                          value={conversionEditCell.draft}
                                                          error={conversionEditCell.hasError}
                                                          onChange={(event) =>
                                                            setConversionEditCell((prev) =>
                                                              prev &&
                                                              prev.tab === 'float' &&
                                                              prev.start === start &&
                                                              prev.order === order
                                                                ? {
                                                                    ...prev,
                                                                    draft: event.target.value,
                                                                    hasError: false
                                                                  }
                                                                : prev
                                                            )
                                                          }
                                                          onBlur={() => {
                                                            const n = Number(conversionEditCell.draft)
                                                            if (!Number.isFinite(n)) {
                                                              setConversionEditCell((prev) =>
                                                                prev &&
                                                                prev.tab === 'float' &&
                                                                prev.start === start &&
                                                                prev.order === order
                                                                  ? { ...prev, hasError: true }
                                                                  : prev
                                                              )
                                                              showUserError('Float value is invalid.')
                                                              return
                                                            }
                                                            const words = float32ToRegisters(n, order)
                                                            updateRegistersBatch(
                                                              tab.connectionId,
                                                              tab.slaveId,
                                                              tab.registerGroupId,
                                                              wordsToCoilBitMap(start, [...words])
                                                            )
                                                            setConversionEditCell(null)
                                                          }}
                                                          onKeyDown={(event) => {
                                                            if (event.key === 'Escape') setConversionEditCell(null)
                                                            if (event.key === 'Enter') {
                                                              ;(event.target as HTMLInputElement).blur()
                                                            }
                                                          }}
                                                          inputProps={{ style: { fontFamily: MONO_FONT_FAMILY } }}
                                                        />
                                                      </TableCell>
                                                    )
                                                  })}
                                                </TableRow>
                                              )
                                            })
                                          : pagedFloatGroups.map((pair, idx) => (
                                              <TableRow key={`float-${idx}`}>
                                                <TableCell sx={{ fontFamily: MONO_FONT_FAMILY }}>
                                                  {formatAddress(pair[0].address)} - {formatAddress(pair[1].address)}
                                                </TableCell>
                                                {(['ABCD', 'CDAB', 'BADC', 'DCBA'] as const).map((order) => {
                                                  const value = registersToFloat32(pair, order)
                                                  const start = pair[0].address
                                                  const isEditing =
                                                    conversionEditCell?.tab === 'float' &&
                                                    conversionEditCell.start === start &&
                                                    conversionEditCell.order === order
                                                  if (!isEditing) {
                                                    return (
                                                      <TableCell key={`float-${start}-${order}`}>
                                                        <Typography
                                                          variant="body2"
                                                          sx={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 700, cursor: 'text' }}
                                                          onClick={() =>
                                                            setConversionEditCell({
                                                              tab: 'float',
                                                              start,
                                                              order,
                                                              draft: String(value),
                                                              hasError: false
                                                            })
                                                          }
                                                        >
                                                          {value.toPrecision(7)}
                                                        </Typography>
                                                      </TableCell>
                                                    )
                                                  }
                                                  return (
                                                    <TableCell key={`float-edit-${start}-${order}`}>
                                                      <TextField
                                                        autoFocus
                                                        size="small"
                                                        value={conversionEditCell.draft}
                                                        error={conversionEditCell.hasError}
                                                        onChange={(event) =>
                                                          setConversionEditCell((prev) =>
                                                            prev &&
                                                            prev.tab === 'float' &&
                                                            prev.start === start &&
                                                            prev.order === order
                                                              ? {
                                                                  ...prev,
                                                                  draft: event.target.value,
                                                                  hasError: false
                                                                }
                                                              : prev
                                                          )
                                                        }
                                                        onBlur={() => {
                                                          const n = Number(conversionEditCell.draft)
                                                          if (!Number.isFinite(n)) {
                                                            setConversionEditCell((prev) =>
                                                              prev &&
                                                              prev.tab === 'float' &&
                                                              prev.start === start &&
                                                              prev.order === order
                                                                ? { ...prev, hasError: true }
                                                                : prev
                                                            )
                                                            showUserError('Float value is invalid.')
                                                            return
                                                          }
                                                          const words = float32ToRegisters(n, order)
                                                          updateRegistersBatch(
                                                            tab.connectionId,
                                                            tab.slaveId,
                                                            tab.registerGroupId,
                                                            {
                                                              [start]: words[0],
                                                              [start + 1]: words[1]
                                                            }
                                                          )
                                                          setConversionEditCell(null)
                                                        }}
                                                        onKeyDown={(event) => {
                                                          if (event.key === 'Escape') setConversionEditCell(null)
                                                          if (event.key === 'Enter') {
                                                            ;(event.target as HTMLInputElement).blur()
                                                          }
                                                        }}
                                                        inputProps={{ style: { fontFamily: MONO_FONT_FAMILY } }}
                                                      />
                                                    </TableCell>
                                                  )
                                                })}
                                              </TableRow>
                                            ))
                                        : effectiveInterpretationTab === 'double'
                                          ? isCoilGroup
                                            ? pagedCoilDoubleGroups.map((groupItem, idx) => {
                                                const words = groupItem.words as [number, number, number, number]
                                                const quad: Register[] = [
                                                  { address: 0, value: words[0], variableName: '', comment: '' },
                                                  { address: 1, value: words[1], variableName: '', comment: '' },
                                                  { address: 2, value: words[2], variableName: '', comment: '' },
                                                  { address: 3, value: words[3], variableName: '', comment: '' }
                                                ]
                                                const start = groupItem.startBit
                                                return (
                                                  <TableRow key={`coil-double-${idx}`}>
                                                    <TableCell sx={{ fontFamily: MONO_FONT_FAMILY }}>
                                                      {formatAddress(groupItem.startBit)} - {formatAddress(groupItem.endBit)}
                                                    </TableCell>
                                                    {(['ABCDEFGH', 'GHEFCDAB', 'BADCFEHG', 'HGFEDCBA'] as const).map((order) => {
                                                      const value = registersToFloat64(quad, order)
                                                      const isEditing =
                                                        conversionEditCell?.tab === 'double' &&
                                                        conversionEditCell.start === start &&
                                                        conversionEditCell.order === order
                                                      if (!isEditing) {
                                                        return (
                                                          <TableCell key={`coil-double-${start}-${order}`}>
                                                            <Typography
                                                              variant="body2"
                                                              sx={{
                                                                fontFamily: MONO_FONT_FAMILY,
                                                                fontWeight: 700,
                                                                cursor: group.type === '01' ? 'text' : 'default'
                                                              }}
                                                              onClick={() => {
                                                                if (group.type !== '01') return
                                                                setConversionEditCell({
                                                                  tab: 'double',
                                                                  start,
                                                                  order,
                                                                  draft: String(value),
                                                                  hasError: false
                                                                })
                                                              }}
                                                            >
                                                              {value.toPrecision(15)}
                                                            </Typography>
                                                          </TableCell>
                                                        )
                                                      }
                                                      return (
                                                        <TableCell key={`coil-double-edit-${start}-${order}`}>
                                                          <TextField
                                                            autoFocus
                                                            size="small"
                                                            value={conversionEditCell.draft}
                                                            error={conversionEditCell.hasError}
                                                            onChange={(event) =>
                                                              setConversionEditCell((prev) =>
                                                                prev &&
                                                                prev.tab === 'double' &&
                                                                prev.start === start &&
                                                                prev.order === order
                                                                  ? {
                                                                      ...prev,
                                                                      draft: event.target.value,
                                                                      hasError: false
                                                                    }
                                                                  : prev
                                                              )
                                                            }
                                                            onBlur={() => {
                                                              const n = Number(conversionEditCell.draft)
                                                              if (!Number.isFinite(n)) {
                                                                setConversionEditCell((prev) =>
                                                                  prev &&
                                                                  prev.tab === 'double' &&
                                                                  prev.start === start &&
                                                                  prev.order === order
                                                                    ? { ...prev, hasError: true }
                                                                    : prev
                                                                )
                                                                showUserError('Double value is invalid.')
                                                                return
                                                              }
                                                              const words64 = float64ToRegisters(n, order)
                                                              updateRegistersBatch(
                                                                tab.connectionId,
                                                                tab.slaveId,
                                                                tab.registerGroupId,
                                                                wordsToCoilBitMap(start, [...words64])
                                                              )
                                                              setConversionEditCell(null)
                                                            }}
                                                            onKeyDown={(event) => {
                                                              if (event.key === 'Escape') setConversionEditCell(null)
                                                              if (event.key === 'Enter') {
                                                                ;(event.target as HTMLInputElement).blur()
                                                              }
                                                            }}
                                                            inputProps={{ style: { fontFamily: MONO_FONT_FAMILY } }}
                                                          />
                                                        </TableCell>
                                                      )
                                                    })}
                                                  </TableRow>
                                                )
                                              })
                                            : pagedDoubleGroups.map((quad, idx) => (
                                                <TableRow key={`double-${idx}`}>
                                                  <TableCell sx={{ fontFamily: MONO_FONT_FAMILY }}>
                                                    {formatAddress(quad[0].address)} - {formatAddress(quad[3].address)}
                                                  </TableCell>
                                                  {(['ABCDEFGH', 'GHEFCDAB', 'BADCFEHG', 'HGFEDCBA'] as const).map((order) => {
                                                    const value = registersToFloat64(quad, order)
                                                    const start = quad[0].address
                                                    const isEditing =
                                                      conversionEditCell?.tab === 'double' &&
                                                      conversionEditCell.start === start &&
                                                      conversionEditCell.order === order
                                                    if (!isEditing) {
                                                      return (
                                                        <TableCell key={`double-${start}-${order}`}>
                                                          <Typography
                                                            variant="body2"
                                                            sx={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 700, cursor: 'text' }}
                                                            onClick={() =>
                                                              setConversionEditCell({
                                                                tab: 'double',
                                                                start,
                                                                order,
                                                                draft: String(value),
                                                                hasError: false
                                                              })
                                                            }
                                                          >
                                                            {value.toPrecision(15)}
                                                          </Typography>
                                                        </TableCell>
                                                      )
                                                    }
                                                    return (
                                                      <TableCell key={`double-edit-${start}-${order}`}>
                                                        <TextField
                                                          autoFocus
                                                          size="small"
                                                          value={conversionEditCell.draft}
                                                          error={conversionEditCell.hasError}
                                                          onChange={(event) =>
                                                            setConversionEditCell((prev) =>
                                                              prev &&
                                                              prev.tab === 'double' &&
                                                              prev.start === start &&
                                                              prev.order === order
                                                                ? {
                                                                    ...prev,
                                                                    draft: event.target.value,
                                                                    hasError: false
                                                                  }
                                                                : prev
                                                            )
                                                          }
                                                          onBlur={() => {
                                                            const n = Number(conversionEditCell.draft)
                                                            if (!Number.isFinite(n)) {
                                                              setConversionEditCell((prev) =>
                                                                prev &&
                                                                prev.tab === 'double' &&
                                                                prev.start === start &&
                                                                prev.order === order
                                                                  ? { ...prev, hasError: true }
                                                                  : prev
                                                              )
                                                              showUserError('Double value is invalid.')
                                                              return
                                                            }
                                                            const words64 = float64ToRegisters(n, order)
                                                            updateRegistersBatch(
                                                              tab.connectionId,
                                                              tab.slaveId,
                                                              tab.registerGroupId,
                                                              {
                                                                [start]: words64[0],
                                                                [start + 1]: words64[1],
                                                                [start + 2]: words64[2],
                                                                [start + 3]: words64[3]
                                                              }
                                                            )
                                                            setConversionEditCell(null)
                                                          }}
                                                          onKeyDown={(event) => {
                                                            if (event.key === 'Escape') setConversionEditCell(null)
                                                            if (event.key === 'Enter') {
                                                              ;(event.target as HTMLInputElement).blur()
                                                            }
                                                          }}
                                                          inputProps={{ style: { fontFamily: MONO_FONT_FAMILY } }}
                                                        />
                                                      </TableCell>
                                                    )
                                                  })}
                                                </TableRow>
                                              ))
                                          : pagedPanelRegisters.map((reg) => (
                                                <TableRow key={reg.address}>
                                                  <TableCell sx={{ fontFamily: MONO_FONT_FAMILY, fontWeight: 700 }}>
                                                    {formatAddress(reg.address)}
                                                  </TableCell>
                                                  <TableCell sx={{ fontFamily: MONO_FONT_FAMILY }}>
                                                    {String.fromCharCode(
                                                      reg.value & 0xff,
                                                      (reg.value >> 8) & 0xff
                                                    )}
                                                  </TableCell>
                                                </TableRow>
                                              ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                            <TablePagination
                              component="div"
                              count={bottomTotalRows}
                              page={bottomCurrentPage}
                              onPageChange={(_, newPage) =>
                                startTableTransition(() =>
                                  setBottomPanelPagination((prev) => ({
                                    ...prev,
                                    [bottomPaginationKey]: { ...bottomPagination, page: newPage }
                                  }))
                                )
                              }
                              rowsPerPage={bottomPagination.rowsPerPage}
                              onRowsPerPageChange={(event) =>
                                startTableTransition(() =>
                                  setBottomPanelPagination((prev) => ({
                                    ...prev,
                                    [bottomPaginationKey]: {
                                      ...bottomPagination,
                                      page: 0,
                                      rowsPerPage: parseInt(event.target.value, 10)
                                    }
                                  }))
                                )
                              }
                              rowsPerPageOptions={[100, 200, 500, 1000]}
                            />

                            {effectiveInterpretationTab === 'long' &&
                            (isCoilGroup ? coilLongGroups.length === 0 : longGroups.length === 0) ? (
                              <Typography color="text.secondary">
                                {isCoilGroup
                                  ? 'Select at least 32 consecutive bits (4 bytes) to decode Long'
                                  : 'Select at least 2 consecutive registers to edit Long type'}
                              </Typography>
                            ) : null}
                            {effectiveInterpretationTab === 'float' &&
                            (isCoilGroup ? coilFloatGroups.length === 0 : floatGroups.length === 0) ? (
                              <Typography color="text.secondary">
                                {isCoilGroup
                                  ? 'Select at least 32 consecutive bits (4 bytes) to decode Float'
                                  : 'Select at least 2 consecutive registers to edit Float type'}
                              </Typography>
                            ) : null}
                            {effectiveInterpretationTab === 'double' &&
                            (isCoilGroup ? coilDoubleGroups.length === 0 : doubleGroups.length === 0) ? (
                              <Typography color="text.secondary">
                                {isCoilGroup
                                  ? 'Select at least 64 consecutive bits (8 bytes) to decode Double'
                                  : 'Select at least 4 consecutive registers to edit Double type'}
                              </Typography>
                            ) : null}
                          </Box>
                        )}
                      </Box>
                    </Paper>
                    <Menu
                      open={!!typedBatchMenu && typedBatchMenu.tabId === activeTabId}
                      onClose={() => setTypedBatchMenu(null)}
                      anchorReference="anchorPosition"
                      anchorPosition={
                        typedBatchMenu
                          ? { top: typedBatchMenu.mouseY, left: typedBatchMenu.mouseX }
                          : undefined
                      }
                    >
                      {TYPED_INTERPRETATION_OPTIONS.map((mode) => {
                        const startAddresses = getBatchAssignableAddresses(tab.selectedAddresses, mode)
                        return (
                          <MenuItem
                            key={`ctx-batch-${mode}`}
                            disabled={startAddresses.length === 0}
                            onClick={() => {
                              applyTypedInterpretationToSelection(activeTabId, mode)
                              setTypedBatchMenu(null)
                            }}
                          >
                            {mode.toUpperCase()} ({getWordSpanForInterpretation(mode)}w)
                          </MenuItem>
                        )
                      })}
                    </Menu>
                    <Menu
                      open={!!typedValueEditMenu && typedValueEditMenu.tabId === activeTabId}
                      onClose={() => setTypedValueEditMenu(null)}
                      anchorReference="anchorPosition"
                      anchorPosition={
                        typedValueEditMenu
                          ? { top: typedValueEditMenu.mouseY, left: typedValueEditMenu.mouseX }
                          : undefined
                      }
                    >
                      {TYPED_INTERPRETATION_OPTIONS.map((mode) => {
                        const targetAddress = typedValueEditMenu?.address
                        const isEnabled =
                          targetAddress !== undefined &&
                          targetAddress !== null &&
                          canSelectInterpretationAtAddress(
                            tab.selectedAddresses,
                            targetAddress,
                            mode,
                            tab.typedInterpretation
                          )
                        return (
                          <MenuItem
                            key={`ctx-value-${mode}`}
                            disabled={!isEnabled}
                            sx={{
                              bgcolor: INTERPRETATION_COLORS[mode].bg,
                              color: INTERPRETATION_COLORS[mode].fg,
                              '&.Mui-disabled': { opacity: 0.45 }
                            }}
                            onClick={() => {
                              if (targetAddress === undefined || targetAddress === null) return
                              if (
                                !canSelectInterpretationAtAddress(
                                  tab.selectedAddresses,
                                  targetAddress,
                                  mode,
                                  tab.typedInterpretation
                                )
                              )
                                return
                              updateTab(activeTabId, {
                                typedInterpretation: {
                                  ...tab.typedInterpretation,
                                  [targetAddress]: mode
                                }
                              })
                              setTypedValueEditMenu(null)
                            }}
                          >
                            {mode.toUpperCase()} ({getWordSpanForInterpretation(mode)}w)
                          </MenuItem>
                        )
                      })}
                    </Menu>
                    <Menu
                      open={!!typedRowTypeMenu.anchorEl}
                      anchorEl={typedRowTypeMenu.anchorEl}
                      onClose={() => setTypedRowTypeMenu({ anchorEl: null, address: null })}
                    >
                      {TYPED_INTERPRETATION_OPTIONS.map((mode) => {
                        const targetAddress = typedRowTypeMenu.address
                        const isEnabled =
                          targetAddress !== null &&
                          canSelectInterpretationAtAddress(
                            tab.selectedAddresses,
                            targetAddress,
                            mode,
                            tab.typedInterpretation
                          )
                        return (
                          <MenuItem
                            key={`typed-row-menu-${mode}`}
                            disabled={!isEnabled}
                            onClick={() => {
                              if (targetAddress === null) return
                              if (
                                !canSelectInterpretationAtAddress(
                                  tab.selectedAddresses,
                                  targetAddress,
                                  mode,
                                  tab.typedInterpretation
                                )
                              )
                                return
                              updateTab(activeTabId, {
                                typedInterpretation: {
                                  ...tab.typedInterpretation,
                                  [targetAddress]: mode
                                }
                              })
                              setTypedRowTypeMenu({ anchorEl: null, address: null })
                            }}
                          >
                            {mode.toUpperCase()} ({getWordSpanForInterpretation(mode)}w)
                          </MenuItem>
                        )
                      })}
                    </Menu>
                    <Menu
                      open={!!displayFormatEditMenu && displayFormatEditMenu.tabId === activeTabId}
                      onClose={() => setDisplayFormatEditMenu(null)}
                      anchorReference="anchorPosition"
                      anchorPosition={
                        displayFormatEditMenu
                          ? { top: displayFormatEditMenu.mouseY, left: displayFormatEditMenu.mouseX }
                          : undefined
                      }
                    >
                      {DISPLAY_FORMAT_OPTIONS.map((option) => (
                        <MenuItem
                          key={`ctx-display-${option.mode}`}
                          sx={{
                            bgcolor: DISPLAY_COLORS[option.mode].bg,
                            color: DISPLAY_COLORS[option.mode].fg
                          }}
                          onClick={() => {
                            const targetAddress = displayFormatEditMenu?.address
                            if (targetAddress === undefined || targetAddress === null) return
                            updateTab(activeTabId, {
                              registerDisplayFormat: {
                                ...tab.registerDisplayFormat,
                                [targetAddress]: option.mode
                              }
                            })
                            setDisplayFormatEditMenu(null)
                          }}
                        >
                          {option.label} ({option.words}w)
                        </MenuItem>
                      ))}
                    </Menu>
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
      <Dialog
        open={unsavedConfirmOpen}
        onClose={() => resolveUnsavedChangesConfirmation(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('server.dialog.unsavedChangesTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('server.dialog.unsavedChangesOnClose')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => resolveUnsavedChangesConfirmation(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => resolveUnsavedChangesConfirmation(true)}
            color="error"
            variant="contained"
          >
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Server
