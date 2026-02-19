import { RegisterType, BaseDataType } from '../types'

/**
 * Represents a single row of Modbus register data in Excel format
 */
export interface ExcelRegisterRow {
  /** Register address (0-65535) */
  Address: number
  /** Unit ID (0-255) */
  'Unit ID': number
  /** Register value - boolean for coils/discrete_inputs, number for registers */
  Value: boolean | number
  /** Data type of the register */
  'Data Type': BaseDataType
  /** Optional comment/description */
  Comment: string
}

/**
 * Structure for exporting Modbus server data to Excel
 */
export interface ExcelExportData {
  /** Server identifier */
  serverId: string
  /** Unit ID */
  unitId: number
  /** Coils data */
  coils: ExcelRegisterRow[]
  /** Discrete inputs data */
  discrete_inputs: ExcelRegisterRow[]
  /** Holding registers data */
  holding_registers: ExcelRegisterRow[]
  /** Input registers data */
  input_registers: ExcelRegisterRow[]
}

/**
 * Structure for importing Modbus register data from Excel
 */
export interface ExcelImportData {
  /** Server identifier */
  serverId?: string
  /** Unit ID (defaults to 1 if not specified) */
  unitId: number
  /** Coils data */
  coils: Omit<ExcelRegisterRow, 'Unit ID'>[]
  /** Discrete inputs data */
  discrete_inputs: Omit<ExcelRegisterRow, 'Unit ID'>[]
  /** Holding registers data */
  holding_registers: Omit<ExcelRegisterRow, 'Unit ID'>[]
  /** Input registers data */
  input_registers: Omit<ExcelRegisterRow, 'Unit ID'>[]
}

/**
 * Supported Excel file formats
 */
export type ExcelFileFormat = 'xlsx' | 'xls'

/**
 * Options for Excel export operation
 */
export interface ExcelExportOptions {
  /** File format (defaults to xlsx) */
  format?: ExcelFileFormat
  /** Include empty registers in export */
  includeEmpty?: boolean
  /** Sheet name prefix */
  sheetNamePrefix?: string
}

/**
 * Options for Excel import operation
 */
export interface ExcelImportOptions {
  /** Expected file format (auto-detected if not specified) */
  format?: ExcelFileFormat
  /** Default unit ID for registers without Unit ID column */
  defaultUnitId?: number
  /** Skip validation of data types */
  skipValidation?: boolean
}

/**
 * Result of Excel export operation
 */
export interface ExcelExportResult {
  success: boolean
  buffer: Buffer
  format: ExcelFileFormat
  rowCount: number
  error?: string
}

/**
 * Result of Excel import operation
 */
export interface ExcelImportResult {
  success: boolean
  data?: ExcelImportData
  rowCount: number
  errors: ExcelImportError[]
}

/**
 * Import error with row information
 */
export interface ExcelImportError {
  row: number
  sheet: string
  column: string
  value: unknown
  message: string
}

/**
 * Raw data structure from Excel sheet
 */
export interface RawExcelRow {
  Address?: number | string
  address?: number | string
  'Unit ID'?: number | string
  UnitID?: number | string
  unit_id?: number | string
  unitId?: number | string
  Value?: boolean | number | string
  value?: boolean | number | string
  'Data Type'?: string
  DataType?: string
  data_type?: string
  dataType?: string
  Comment?: string
  comment?: string
}

/**
 * Column mapping for Excel headers
 */
export const EXCEL_COLUMN_HEADERS: Record<keyof ExcelRegisterRow, string> = {
  Address: 'Address',
  'Unit ID': 'Unit ID',
  Value: 'Value',
  'Data Type': 'Data Type',
  Comment: 'Comment'
} as const

/**
 * Sheet names for each register type
 */
export const REGISTER_TYPE_SHEET_NAMES: Record<RegisterType, string> = {
  coils: 'Coils',
  discrete_inputs: 'Discrete Inputs',
  holding_registers: 'Holding Registers',
  input_registers: 'Input Registers'
} as const
