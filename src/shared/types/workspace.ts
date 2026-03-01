import { z } from 'zod'

export const RegisterDisplayFormatSchema = z.enum(['dec', 'hex', 'bin', 'oct'])
export type RegisterDisplayFormat = z.infer<typeof RegisterDisplayFormatSchema>

export const PlotInterpretationSchema = z.enum([
  'short',
  'ushort',
  'int',
  'uint',
  'long',
  'ulong',
  'float',
  'double'
])
export type PlotInterpretation = z.infer<typeof PlotInterpretationSchema>

export const RegisterSchema = z.object({
  address: z.number(),
  value: z.number(),
  variableName: z.string(),
  comment: z.string(),
  displayFormat: RegisterDisplayFormatSchema.optional()
})

export const RegisterGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['01', '02', '03', '04']),
  startAddress: z.number(),
  count: z.number(),
  registers: z.array(RegisterSchema)
})

export const SlaveSchema = z.object({
  id: z.string(),
  alias: z.string(),
  slaveId: z.number(),
  responseDelay: z.number().default(0),
  initMode: z.enum(['none', 'random', 'address']).default('none'),
  addressType: z.enum(['protocol', 'plc']).default('protocol'),
  registerGroups: z.array(RegisterGroupSchema)
})

export const ConnectionSchema = z.object({
  id: z.string(),
  alias: z.string(),
  mode: z.enum(['rtu', 'tcp', 'udp', 'rtuovertcp', 'rtuoverudp']),
  invalidRequestBehavior: z.enum(['silent', 'exception']).optional(),
  serialPort: z.string().optional(),
  baudRate: z.number().optional(),
  dataBits: z.number().optional(),
  parity: z.enum(['none', 'even', 'odd']).optional(),
  stopBits: z.number().optional(),
  flowControl: z.enum(['none', 'rtscts', 'xonxoff']).optional(),
  frameFormat: z.enum(['rtu', 'ascii']).optional(),
  ipAddress: z.string().optional(),
  port: z.number().optional(),
  isOpen: z.boolean().default(false),
  slaves: z.array(SlaveSchema)
})

export const WorkspaceTabSettingsSchema = z.object({
  interpretationTab: z.enum(['basic', 'long', 'float', 'double', 'typed', 'string']),
  stringEncoding: z.string(),
  typedInterpretation: z.record(z.string(), PlotInterpretationSchema),
  registerDisplayFormat: z.record(z.string(), RegisterDisplayFormatSchema)
})

export const ScriptDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  intervalMs: z.number(),
  code: z.string(),
  lastError: z.string().optional(),
  lastRunAt: z.number().optional()
})

import { ServerConnectionConfig } from './server'

export const toServerConfig = (connection: Connection): ServerConnectionConfig => {
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

export interface Register {
  address: number
  value: number
  variableName: string
  comment: string
  displayFormat?: RegisterDisplayFormat
}

export interface RegisterGroup {
  id: string
  name: string
  type: '01' | '02' | '03' | '04'
  startAddress: number
  count: number
  registers: Register[]
}

export interface Slave {
  id: string
  alias: string
  slaveId: number
  responseDelay: number
  initMode: 'none' | 'random' | 'address'
  addressType: 'protocol' | 'plc'
  registerGroups: RegisterGroup[]
}

export interface Connection {
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

export interface ScriptDefinition {
  id: string
  name: string
  enabled: boolean
  intervalMs: number
  code: string
  lastError?: string
  lastRunAt?: number
}

export interface ScriptRuntimeApi {
  getValue: (
    unitId: number,
    registerType: RegisterGroup['type'],
    address: number
  ) => number | undefined
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

export interface ScriptRuntimeEvent {
  type: 'manual' | 'interval'
  timestamp: number
}

export interface PlotWindowState {
  chartId: string
  title: string
  series: Array<{
    address: number
    label: string
    color: string
    interpretation: PlotInterpretation
  }>
  selectionColor: string
}

export type AddressDisplayMode = 'protocol_hex' | 'protocol_dec' | 'plc'

export interface WorkspaceTabSettings {
  interpretationTab: 'basic' | 'long' | 'float' | 'double' | 'typed' | 'string'
  stringEncoding: string
  typedInterpretation: Record<number, PlotInterpretation>
  registerDisplayFormat: Record<number, RegisterDisplayFormat>
}

export interface WorkspaceFileHandle {
  name?: string
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>
    close: () => Promise<void>
  }>
}

export interface RecentWorkspaceEntry {
  id: string
  name: string
  path: string
  updatedAt: number
}

export const PersistedWorkspaceSnapshotSchema = z.object({
  version: z.number(),
  connections: z.array(ConnectionSchema),
  tabSettings: z.record(z.string(), WorkspaceTabSettingsSchema).optional(),
  scriptsByConnection: z.record(z.string(), z.array(ScriptDefinitionSchema)).optional(),
  openTabs: z
    .array(
      z.object({
        connectionId: z.string(),
        slaveId: z.string(),
        registerGroupId: z.string()
      })
    )
    .optional(),
  activeTabId: z.string().nullable().optional()
})

export type PersistedWorkspaceSnapshot = z.infer<typeof PersistedWorkspaceSnapshotSchema>
