import type {
  ConnectionConfig,
  DeepPartial,
  RegisterConfig,
  RemoveRegisterParams,
  ScanRegistersParameters,
  ScanUnitIDParameters,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  WriteParameters,
  RegisterMapping,
  ResetRegistersParams,
  ResetBoolsParams,
  CreateServerParams,
  ClientState,
  AddRegisterParams,
  RegisterData,
  Transaction,
  ScanUnitIDResult,
  RegisterValue,
  BooleanValue,
  WindowsOpen,
  AddressGroup,
  SerialPortInfo,
  SerialPortValidationResult,
  ServerCommPacket,
  PacketStats,
  AppendSystemLogParams,
  SystemLogEntry,
  SystemLogStats
} from '@shared'
import { SharedProps } from 'notistack'

/**
 * IPC Channel Definitions
 *
 * Channel names are defined in snake_case (e.g., 'get_connection_config').
 * These are automatically converted to camelCase methods on window.api
 * in the preload script (e.g., window.api.getConnectionConfig()).
 *
 * To add a new IPC channel:
 * 1. Add the channel name to IPC_CHANNELS
 * 2. Define its args and return type in IpcHandlerSpec
 * 3. The camelCase method will be automatically available on window.api
 */
export const IPC_CHANNELS = [
  'get_connection_config',
  'update_connection_config',
  'update_register_config',
  'get_client_state',
  'set_register_mapping',
  'connect',
  'disconnect',
  'read',
  'start_polling',
  'stop_polling',
  'write',
  'scan_unit_ids',
  'stop_scanning_unit_ids',
  'scan_registers',
  'stop_scanning_registers',
  'add_replace_server_register',
  'remove_server_register',
  'sync_server_register',
  'reset_registers',
  'set_bool',
  'reset_bools',
  'sync_bools',
  'set_server_port',
  'get_app_version',
  'create_server',
  'delete_server',
  'reset_server',
  'list_serial_ports',
  'validate_serial_port',
  'start_comm_monitor',
  'stop_comm_monitor',
  'clear_comm_monitor',
  'export_comm_log',
  'get_comm_stats',
  'read_text_file',
  'write_text_file',
  'pick_workspace_file',
  'append_system_log',
  'get_system_logs',
  'get_system_log_stats',
  'clear_system_logs',
  'export_system_logs',
  'set_log_buffer_limit_mb',
  'get_log_buffer_limit_mb',
  'export_server_data',
  'import_server_data',
  'create_excel_template'
] as const

export type IpcChannel = (typeof IPC_CHANNELS)[number]

/**
 * IpcHandlerMap associates each IpcChannel with:
 * - args: the argument types that the renderer needs to pass
 * - return: the type that the handler in the main/backend returns
 *
 * ! NOTE: The keys below MUST exactly match IpcChannel.
 * ! If you add a channel to IPC_CHANNELS, add it here.
 * ! If you remove one, remove it here. No extras allowed.
 */
export interface IpcHandlerSpec {
  /** Retrieve the ConnectionConfig */
  ['get_connection_config']: {
    args: []
    return: ConnectionConfig
  }

  /** Update the ConnectionConfig (DeepPartial) */
  ['update_connection_config']: {
    args: [DeepPartial<ConnectionConfig>]
    return: void
  }

  /** Update the RegisterConfig (DeepPartial) */
  ['update_register_config']: {
    args: [DeepPartial<RegisterConfig>]
    return: void
  }

  /** Retrieve the current ClientState */
  ['get_client_state']: {
    args: []
    return: ClientState
  }

  /** Set the RegisterMapping */
  ['set_register_mapping']: {
    args: [RegisterMapping]
    return: void
  }

  /** Connect the Modbus client */
  ['connect']: {
    args: []
    return: void
  }

  /** Disconnect the Modbus client */
  ['disconnect']: {
    args: []
    return: void
  }

  /** Read registers (returns RegisterData[] or undefined) */
  ['read']: {
    args: []
    return: void
  }

  /** Start polling on the Modbus client */
  ['start_polling']: {
    args: []
    return: void
  }

  /** Stop polling on the Modbus client */
  ['stop_polling']: {
    args: []
    return: void
  }

  /** Write to registers via the Modbus client */
  ['write']: {
    args: [WriteParameters]
    return: void
  }

  /** Start scanning for unit IDs */
  ['scan_unit_ids']: {
    args: [ScanUnitIDParameters]
    return: void
  }

  /** Stop scanning for unit IDs */
  ['stop_scanning_unit_ids']: {
    args: []
    return: void
  }

  /** Start scanning registers */
  ['scan_registers']: {
    args: [ScanRegistersParameters]
    return: void
  }

  /** Stop scanning registers */
  ['stop_scanning_registers']: {
    args: []
    return: void
  }

  /** Add or replace a server register */
  ['add_replace_server_register']: {
    args: [AddRegisterParams]
    return: void
  }

  /** Remove a register value on the server */
  ['remove_server_register']: {
    args: [RemoveRegisterParams]
    return: void
  }

  /** Synchronize server registers */
  ['sync_server_register']: {
    args: [SyncRegisterValueParams]
    return: void
  }

  /** Reset all server registers */
  ['reset_registers']: {
    args: [ResetRegistersParams]
    return: void
  }

  /** Set a boolean on the server */
  ['set_bool']: {
    args: [SetBooleanParameters]
    return: void
  }

  /** Reset all booleans on the server */
  ['reset_bools']: {
    args: [ResetBoolsParams]
    return: void
  }

  /** Synchronize all booleans on the server */
  ['sync_bools']: {
    args: [SyncBoolsParameters]
    return: void
  }

  /** Set the server port */
  ['set_server_port']: {
    args: [CreateServerParams]
    return: Promise<string>
  }

  /** Create a new server */
  ['create_server']: {
    args: [CreateServerParams]
    return: Promise<string>
  }

  /** Delete an existing server (UUID) */
  ['delete_server']: {
    args: [string]
    return: void
  }

  /** Retrieve the application version */
  ['get_app_version']: {
    args: []
    return: string
  }

  /** Reset an existing server (UUID) */
  ['reset_server']: {
    args: [string]
    return: void
  }

  /** List available serial ports */
  ['list_serial_ports']: {
    args: []
    return: SerialPortInfo[]
  }

  /** Validate whether a serial port path exists */
  ['validate_serial_port']: {
    args: [string]
    return: SerialPortValidationResult
  }

  /** Start communication monitor */
  ['start_comm_monitor']: {
    args: []
    return: void
  }

  /** Stop communication monitor */
  ['stop_comm_monitor']: {
    args: []
    return: void
  }

  /** Clear communication monitor logs */
  ['clear_comm_monitor']: {
    args: []
    return: void
  }

  /** Export communication log to file */
  ['export_comm_log']: {
    args: [string]
    return: void
  }

  /** Get communication statistics */
  ['get_comm_stats']: {
    args: []
    return: PacketStats
  }

  /** Read UTF-8 text file from absolute path */
  ['read_text_file']: {
    args: [string]
    return: string
  }

  /** Write UTF-8 text file to absolute path */
  ['write_text_file']: {
    args: [string, string]
    return: void
  }

  /** Pick a workspace file path from native open dialog */
  ['pick_workspace_file']: {
    args: []
    return: string | null
  }

  /** Append a system log entry */
  ['append_system_log']: {
    args: [AppendSystemLogParams]
    return: void
  }

  /** Get latest system log entries */
  ['get_system_logs']: {
    args: [number?]
    return: SystemLogEntry[]
  }

  /** Get system log statistics */
  ['get_system_log_stats']: {
    args: []
    return: SystemLogStats
  }

  /** Clear system logs */
  ['clear_system_logs']: {
    args: []
    return: void
  }

  /** Export system logs to file */
  ['export_system_logs']: {
    args: [string]
    return: void
  }

  /** Set communication/system log ring-buffer limit (MB) */
  ['set_log_buffer_limit_mb']: {
    args: [number]
    return: number
  }

  /** Get communication/system log ring-buffer limit (MB) */
  ['get_log_buffer_limit_mb']: {
    args: []
    return: number
  }

  /** Export server register data to Excel */
  ['export_server_data']: {
    args: [ExportServerDataParams]
    return: ExportServerDataResult
  }

  /** Import server register data from Excel */
  ['import_server_data']: {
    args: [ImportServerDataParams]
    return: ImportServerDataResult
  }

  /** Create Excel template for import */
  ['create_excel_template']: {
    args: [CreateExcelTemplateParams]
    return: CreateExcelTemplateResult
  }
}

// Excel Import/Export Types
export interface ExportServerDataParams {
  uuid: string
  filePath: string
  registerTypes?: ('coils' | 'discrete_inputs' | 'holding_registers' | 'input_registers')[]
}

export interface ExportServerDataResult {
  success: boolean
  filePath: string
  rowCount: number
  error?: string
}

export interface ImportServerDataParams {
  uuid: string
  filePath: string
  unitId?: string
  mergeStrategy?: 'replace' | 'merge' | 'append'
}

export interface ImportServerDataResult {
  success: boolean
  importedCount: number
  errors: Array<{ row: number; message: string }>
  warnings: string[]
}

export interface CreateExcelTemplateParams {
  filePath: string
  format?: 'xlsx' | 'xls'
}

export interface CreateExcelTemplateResult {
  success: boolean
  filePath: string
  error?: string
}

export type PlotInterpretation =
  | 'short'
  | 'ushort'
  | 'int'
  | 'uint'
  | 'long'
  | 'ulong'
  | 'float'
  | 'double'

export interface RegisterPlotSeriesSpec {
  address: number
  label: string
  color: string
  interpretation: PlotInterpretation
}

export interface RegisterPlotWindowInit {
  chartId: string
  title: string
  connectionId: string
  connectionAlias: string
  slaveId: string
  slaveAlias: string
  registerGroupId: string
  registerGroupName: string
  registerType: '01' | '02' | '03' | '04'
  series: RegisterPlotSeriesSpec[]
}

export interface RegisterPlotData {
  chartId: string
  timestamp: number
  rawRegisters: Record<number, number>
}

export interface ScriptDefinitionPayload {
  id: string
  name: string
  enabled: boolean
  intervalMs: number
  code: string
  lastError?: string
  lastRunAt?: number
}

export interface ScriptEditorWindowInit {
  connectionId: string
  connectionAlias: string
  scripts: ScriptDefinitionPayload[]
}

export interface ScriptEditorApplyPayload {
  connectionId: string
  scripts: ScriptDefinitionPayload[]
}

export interface ScriptEditorRunPayload {
  connectionId: string
  scriptId: string
}

export type IpcHandlerMap = {
  [K in IpcChannel]: IpcHandlerSpec[K]
}

/**
 * Events emitted
 */
export const IPC_EVENTS = [
  'backend_message',
  'client_state',
  'register_data',
  'transaction',
  'scan_unit_id_result',
  'scan_progress',
  'register_value',
  'boolean_value',
  'window_update',
  'open_server_window',
  'open_comm_log_window',
  'open_register_plot_window',
  'address_groups',
  'comm_packet',
  'comm_monitor_clear',
  'register_plot_init',
  'register_plot_data',
  'register_plot_window_closed',
  'close_register_plot_windows',
  'open_script_editor_window',
  'script_editor_init',
  'script_editor_apply',
  'script_editor_run_once',
  'script_editor_window_closed',
  'system_log_entry',
  'system_log_clear'
] as const

export type IpcEvent = (typeof IPC_EVENTS)[number]

export interface IpcEventPayloadMap {
  ['backend_message']: [BackendMessage]
  ['client_state']: [ClientState]
  ['register_data']: [RegisterData[]]
  ['transaction']: [Transaction]
  ['scan_unit_id_result']: [ScanUnitIDResult]
  ['scan_progress']: [number]
  ['register_value']: [RegisterValue]
  ['boolean_value']: [BooleanValue]
  ['window_update']: [WindowsOpen]
  ['open_server_window']: []
  ['open_comm_log_window']: []
  ['open_register_plot_window']: [RegisterPlotWindowInit]
  ['address_groups']: [AddressGroup[]]
  ['comm_packet']: [ServerCommPacket]
  ['comm_monitor_clear']: [void]
  ['register_plot_init']: [RegisterPlotWindowInit]
  ['register_plot_data']: [RegisterPlotData]
  ['register_plot_window_closed']: [string]
  ['close_register_plot_windows']: []
  ['open_script_editor_window']: [ScriptEditorWindowInit]
  ['script_editor_init']: [ScriptEditorWindowInit]
  ['script_editor_apply']: [ScriptEditorApplyPayload]
  ['script_editor_run_once']: [ScriptEditorRunPayload]
  ['script_editor_window_closed']: [string]
  ['system_log_entry']: [SystemLogEntry]
  ['system_log_clear']: [void]
}

export interface BackendMessage {
  message: string
  variant: SharedProps['variant']
  error: unknown | null
}
