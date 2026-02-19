import * as XLSX from 'xlsx'
import type {
  ExcelExportData,
  ExcelImportData,
  ExcelRegisterRow,
  ExcelExportOptions,
  ExcelImportOptions,
  ExcelExportResult,
  ExcelImportResult,
  ExcelImportError,
  RawExcelRow,
  ExcelFileFormat
} from './excel.types'
import { REGISTER_TYPE_SHEET_NAMES, EXCEL_COLUMN_HEADERS } from './excel.types'
import type { RegisterType, BaseDataType } from '../types'

// Valid data types for validation
const VALID_DATA_TYPES: BaseDataType[] = [
  'none',
  'int16',
  'uint16',
  'int32',
  'uint32',
  'int64',
  'uint64',
  'float',
  'double',
  'unix',
  'datetime',
  'utf8'
]

/**
 * Export Modbus server data to Excel format
 */
export const exportToExcel = (
  data: ExcelExportData,
  options: ExcelExportOptions = {}
): ExcelExportResult => {
  const { format = 'xlsx', sheetNamePrefix = '' } = options

  try {
    const workbook = XLSX.utils.book_new()
    let totalRowCount = 0

    // Export each register type to its own sheet
    const registerTypes: RegisterType[] = [
      'coils',
      'discrete_inputs',
      'holding_registers',
      'input_registers'
    ]

    for (const registerType of registerTypes) {
      const rows = data[registerType]

      if (rows.length === 0) {
        // Create empty sheet with headers only
        const emptyWs = XLSX.utils.aoa_to_sheet([Object.values(EXCEL_COLUMN_HEADERS)])
        const sheetName = `${sheetNamePrefix}${REGISTER_TYPE_SHEET_NAMES[registerType]}`.trim()
        XLSX.utils.book_append_sheet(workbook, emptyWs, sheetName)
        continue
      }

      const worksheetData = rows.map((row) => [
        row.Address,
        row['Unit ID'],
        row.Value,
        row['Data Type'],
        row.Comment
      ])

      // Add headers
      worksheetData.unshift(Object.values(EXCEL_COLUMN_HEADERS))

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

      // Set column widths
      worksheet['!cols'] = [
        { wch: 10 }, // Address
        { wch: 8 }, // Unit ID
        { wch: 15 }, // Value
        { wch: 12 }, // Data Type
        { wch: 30 } // Comment
      ]

      const sheetName = `${sheetNamePrefix}${REGISTER_TYPE_SHEET_NAMES[registerType]}`.trim()
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
      totalRowCount += rows.length
    }

    // Write to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: format })

    return {
      success: true,
      buffer: Buffer.from(buffer),
      format,
      rowCount: totalRowCount
    }
  } catch (error) {
    return {
      success: false,
      buffer: Buffer.alloc(0),
      format,
      rowCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error during export'
    }
  }
}

/**
 * Import Modbus register data from Excel format
 */
export const importFromExcel = (
  buffer: Buffer,
  options: ExcelImportOptions = {}
): ExcelImportResult => {
  const { defaultUnitId = 1, skipValidation = false } = options
  const errors: ExcelImportError[] = []

  try {
    // Read workbook from buffer
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const result: ExcelImportData = {
      unitId: defaultUnitId,
      coils: [],
      discrete_inputs: [],
      holding_registers: [],
      input_registers: []
    }

    let totalRowCount = 0

    // Map sheet names to register types
    const sheetToRegisterType: Record<string, RegisterType> = {
      [REGISTER_TYPE_SHEET_NAMES.coils]: 'coils',
      Coils: 'coils',
      coils: 'coils',
      [REGISTER_TYPE_SHEET_NAMES.discrete_inputs]: 'discrete_inputs',
      'Discrete Inputs': 'discrete_inputs',
      DiscreteInputs: 'discrete_inputs',
      discrete_inputs: 'discrete_inputs',
      [REGISTER_TYPE_SHEET_NAMES.holding_registers]: 'holding_registers',
      'Holding Registers': 'holding_registers',
      HoldingRegisters: 'holding_registers',
      holding_registers: 'holding_registers',
      [REGISTER_TYPE_SHEET_NAMES.input_registers]: 'input_registers',
      'Input Registers': 'input_registers',
      InputRegisters: 'input_registers',
      input_registers: 'input_registers'
    }

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName]
      if (!worksheet) continue

      const registerType = sheetToRegisterType[sheetName]
      if (!registerType) {
        // Skip unknown sheets
        continue
      }

      // Convert sheet to JSON
      const rawData = XLSX.utils.sheet_to_json<RawExcelRow>(worksheet, {
        header: 'A',
        raw: false,
        defval: undefined
      })

      if (rawData.length === 0) continue

      // Detect if first row is headers
      const firstRow = rawData[0]
      const hasHeaders = detectHeaders(firstRow)
      const dataRows = hasHeaders ? rawData.slice(1) : rawData

      for (let i = 0; i < dataRows.length; i++) {
        const rowIndex = hasHeaders ? i + 2 : i + 1
        const row = dataRows[i]

        const parseResult = parseExcelRow(row, rowIndex, sheetName, registerType, {
          defaultUnitId,
          skipValidation
        })

        if (parseResult.error) {
          errors.push(parseResult.error)
          continue
        }

        if (parseResult.data) {
          result[registerType].push(parseResult.data)
          totalRowCount++
        }
      }
    }

    // If no valid sheets found, try to parse as a single generic sheet
    if (totalRowCount === 0 && workbook.SheetNames.length > 0) {
      const genericResult = parseGenericSheet(workbook, defaultUnitId, skipValidation, errors)
      if (genericResult.rowCount > 0) {
        return {
          success: errors.length === 0,
          data: genericResult.data,
          rowCount: genericResult.rowCount,
          errors
        }
      }
    }

    return {
      success: errors.length === 0,
      data: result,
      rowCount: totalRowCount,
      errors
    }
  } catch (error) {
    return {
      success: false,
      rowCount: 0,
      errors: [
        {
          row: 0,
          sheet: 'N/A',
          column: 'N/A',
          value: null,
          message: error instanceof Error ? error.message : 'Unknown error during import'
        }
      ]
    }
  }
}

/**
 * Detect if the first row contains headers
 */
const detectHeaders = (row: RawExcelRow): boolean => {
  if (!row) return false

  const possibleHeaders = ['Address', 'Unit ID', 'Data Type', 'Comment', 'Value']
  const values = Object.values(row).filter((v): v is string => typeof v === 'string')

  return possibleHeaders.some((header) =>
    values.some((value) => value.toLowerCase() === header.toLowerCase())
  )
}

/**
 * Parse a single Excel row into register data
 */
const parseExcelRow = (
  row: RawExcelRow,
  rowIndex: number,
  sheetName: string,
  registerType: RegisterType,
  options: { defaultUnitId: number; skipValidation: boolean }
): { data?: Omit<ExcelRegisterRow, 'Unit ID'>; error?: ExcelImportError } => {
  const { skipValidation } = options

  // Handle different column naming conventions
  const addressRaw = row.Address ?? row.address
  const unitIdRaw = row['Unit ID'] ?? row.UnitID ?? row.unit_id ?? row.unitId
  const valueRaw = row.Value ?? row.value
  const dataTypeRaw = row['Data Type'] ?? row.DataType ?? row.data_type ?? row.dataType
  const commentRaw = row.Comment ?? row.comment

  // Parse address
  const address = parseNumericValue(addressRaw)
  if (address === null || address < 0 || address > 65535) {
    return {
      error: {
        row: rowIndex,
        sheet: sheetName,
        column: 'Address',
        value: addressRaw,
        message: `Invalid address: ${addressRaw}. Must be a number between 0 and 65535.`
      }
    }
  }

  // Parse and validate unit ID (stored at higher level, not per-row)
  if (unitIdRaw !== undefined) {
    const parsedUnitId = parseNumericValue(unitIdRaw)
    if (parsedUnitId === null || parsedUnitId < 0 || parsedUnitId > 255) {
      return {
        error: {
          row: rowIndex,
          sheet: sheetName,
          column: 'Unit ID',
          value: unitIdRaw,
          message: `Invalid Unit ID: ${unitIdRaw}. Must be a number between 0 and 255.`
        }
      }
    }
    void parsedUnitId
  }

  // Parse data type
  let dataType: BaseDataType = 'none'
  if (dataTypeRaw) {
    const normalizedType = normalizeDataType(dataTypeRaw)
    if (!skipValidation && !VALID_DATA_TYPES.includes(normalizedType)) {
      return {
        error: {
          row: rowIndex,
          sheet: sheetName,
          column: 'Data Type',
          value: dataTypeRaw,
          message: `Invalid data type: ${dataTypeRaw}. Valid types: ${VALID_DATA_TYPES.join(', ')}`
        }
      }
    }
    dataType = normalizedType
  }

  // Parse value based on register type
  let value: boolean | number
  if (registerType === 'coils' || registerType === 'discrete_inputs') {
    // Boolean values
    if (typeof valueRaw === 'boolean') {
      value = valueRaw
    } else if (typeof valueRaw === 'string') {
      const normalized = valueRaw.toLowerCase().trim()
      if (
        normalized === 'true' ||
        normalized === '1' ||
        normalized === 'yes' ||
        normalized === 'on'
      ) {
        value = true
      } else if (
        normalized === 'false' ||
        normalized === '0' ||
        normalized === 'no' ||
        normalized === 'off'
      ) {
        value = false
      } else {
        return {
          error: {
            row: rowIndex,
            sheet: sheetName,
            column: 'Value',
            value: valueRaw,
            message: `Invalid boolean value: ${valueRaw}. Use true/false, 1/0, yes/no, or on/off.`
          }
        }
      }
    } else if (typeof valueRaw === 'number') {
      value = valueRaw !== 0
    } else {
      value = false
    }
  } else {
    // Numeric values for registers
    const numValue = parseNumericValue(valueRaw)
    if (numValue === null) {
      return {
        error: {
          row: rowIndex,
          sheet: sheetName,
          column: 'Value',
          value: valueRaw,
          message: `Invalid numeric value: ${valueRaw}`
        }
      }
    }
    value = numValue
  }

  return {
    data: {
      Address: address,
      Value: value,
      'Data Type': dataType,
      Comment: String(commentRaw ?? '')
    }
  }
}

/**
 * Parse a generic sheet (non-standard format)
 */
const parseGenericSheet = (
  workbook: XLSX.WorkBook,
  defaultUnitId: number,
  skipValidation: boolean,
  errors: ExcelImportError[]
): { data: ExcelImportData; rowCount: number } => {
  const result: ExcelImportData = {
    unitId: defaultUnitId,
    coils: [],
    discrete_inputs: [],
    holding_registers: [],
    input_registers: []
  }

  let totalRowCount = 0

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) continue

    const rawData = XLSX.utils.sheet_to_json<RawExcelRow>(worksheet, {
      header: 'A',
      raw: false
    })

    if (rawData.length === 0) continue

    // Try to detect if there's a Register Type column
    const firstRow = rawData[0]
    const hasHeaders = detectHeaders(firstRow)
    const dataRows = hasHeaders ? rawData.slice(1) : rawData

    for (let i = 0; i < dataRows.length; i++) {
      const rowIndex = hasHeaders ? i + 2 : i + 1
      const row = dataRows[i]

      // Try to determine register type from a column or default to holding_registers
      const registerTypeRaw =
        (row as unknown as Record<string, string>)['Register Type'] ??
        (row as unknown as Record<string, string>)['RegisterType'] ??
        (row as unknown as Record<string, string>)['register_type']

      let registerType: RegisterType = 'holding_registers'
      if (registerTypeRaw) {
        const detected = detectRegisterType(String(registerTypeRaw))
        if (detected) {
          registerType = detected
        }
      }

      const parseResult = parseExcelRow(row, rowIndex, sheetName, registerType, {
        defaultUnitId,
        skipValidation
      })

      if (parseResult.error) {
        errors.push(parseResult.error)
        continue
      }

      if (parseResult.data) {
        result[registerType].push(parseResult.data)
        totalRowCount++
      }
    }
  }

  return { data: result, rowCount: totalRowCount }
}

/**
 * Parse a numeric value from various input types
 */
const parseNumericValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    // Handle hex values
    if (value.startsWith('0x') || value.startsWith('0X')) {
      const parsed = parseInt(value, 16)
      return Number.isNaN(parsed) ? null : parsed
    }

    // Handle binary values
    if (value.startsWith('0b') || value.startsWith('0B')) {
      const parsed = parseInt(value.slice(2), 2)
      return Number.isNaN(parsed) ? null : parsed
    }

    const parsed = parseFloat(value)
    return Number.isNaN(parsed) ? null : parsed
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  return null
}

/**
 * Normalize data type string to BaseDataType
 */
const normalizeDataType = (type: string): BaseDataType => {
  const normalized = type.toLowerCase().trim()

  const typeMap: Record<string, BaseDataType> = {
    none: 'none',
    int16: 'int16',
    uint16: 'uint16',
    int32: 'int32',
    uint32: 'uint32',
    int64: 'int64',
    uint64: 'uint64',
    float: 'float',
    double: 'double',
    unix: 'unix',
    datetime: 'datetime',
    'date-time': 'datetime',
    utf8: 'utf8',
    utf: 'utf8',
    string: 'utf8'
  }

  return typeMap[normalized] ?? 'none'
}

/**
 * Detect register type from string
 */
const detectRegisterType = (value: string): RegisterType | null => {
  const normalized = value.toLowerCase().replace(/[_\s]/g, '')

  if (normalized.includes('coil') && !normalized.includes('discrete')) {
    return 'coils'
  }
  if (normalized.includes('discrete') || normalized.includes('inputbit')) {
    return 'discrete_inputs'
  }
  if (
    normalized.includes('holding') ||
    normalized.includes('output') ||
    normalized.includes('holdingregister')
  ) {
    return 'holding_registers'
  }
  if (normalized.includes('input') && normalized.includes('register')) {
    return 'input_registers'
  }

  return null
}

/**
 * Get file format from filename
 */
export const getFileFormatFromName = (filename: string): ExcelFileFormat | null => {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.xlsx')) return 'xlsx'
  if (lower.endsWith('.xls')) return 'xls'
  return null
}

/**
 * Validate Excel data before export
 */
export const validateExportData = (data: ExcelExportData): string[] => {
  const errors: string[] = []

  if (!data.serverId) {
    errors.push('Server ID is required')
  }

  if (data.unitId < 0 || data.unitId > 255) {
    errors.push(`Invalid Unit ID: ${data.unitId}. Must be between 0 and 255.`)
  }

  const validateRows = (rows: ExcelRegisterRow[], type: string): void => {
    for (const row of rows) {
      if (row.Address < 0 || row.Address > 65535) {
        errors.push(`Invalid address ${row.Address} in ${type}. Must be between 0 and 65535.`)
      }
      if (row['Unit ID'] < 0 || row['Unit ID'] > 255) {
        errors.push(`Invalid Unit ID ${row['Unit ID']} in ${type}. Must be between 0 and 255.`)
      }
    }
  }

  validateRows(data.coils, 'coils')
  validateRows(data.discrete_inputs, 'discrete_inputs')
  validateRows(data.holding_registers, 'holding_registers')
  validateRows(data.input_registers, 'input_registers')

  return errors
}

/**
 * Create empty Excel template for import
 */
export const createExcelTemplate = (format: ExcelFileFormat = 'xlsx'): Buffer => {
  const workbook = XLSX.utils.book_new()

  const registerTypes: RegisterType[] = [
    'coils',
    'discrete_inputs',
    'holding_registers',
    'input_registers'
  ]

  for (const registerType of registerTypes) {
    const worksheet = XLSX.utils.aoa_to_sheet([Object.values(EXCEL_COLUMN_HEADERS)])

    worksheet['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 30 }]

    XLSX.utils.book_append_sheet(workbook, worksheet, REGISTER_TYPE_SHEET_NAMES[registerType])
  }

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: format })
  return Buffer.from(buffer)
}
