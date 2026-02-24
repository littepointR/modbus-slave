import { AppState } from './state'
import { IpcHandlerMap, IpcEvent, IpcEventPayloadMap } from '@shared'
import { ModbusServer } from './modules/mobusServer'
import { IpcMainEvent, IpcMainInvokeEvent, dialog, ipcMain } from 'electron'

const ipcHandlerRegistry = new Map<keyof IpcHandlerMap, (...args: unknown[]) => unknown>()

export const ipcHandle = <C extends keyof IpcHandlerMap>(
  channel: C,
  listener: (
    event: IpcMainInvokeEvent,
    ...args: IpcHandlerMap[C]['args']
  ) => Promise<IpcHandlerMap[C]['return']> | IpcHandlerMap[C]['return']
): void => {
  ipcHandlerRegistry.set(channel, (...args: unknown[]) => {
    return listener({} as IpcMainInvokeEvent, ...(args as IpcHandlerMap[C]['args']))
  })
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, listener)
}

export const invokeIpcHandler = async <C extends keyof IpcHandlerMap>(
  channel: C,
  ...args: IpcHandlerMap[C]['args']
): Promise<IpcHandlerMap[C]['return']> => {
  const handler = ipcHandlerRegistry.get(channel)
  if (!handler) {
    throw new Error(`IPC handler not registered for channel: ${channel}`)
  }
  return (await handler(...args)) as IpcHandlerMap[C]['return']
}

export const invokeIpcHandlerUnsafe = async (
  channel: keyof IpcHandlerMap,
  args: unknown[]
): Promise<unknown> => {
  const handler = ipcHandlerRegistry.get(channel)
  if (!handler) {
    throw new Error(`IPC handler not registered for channel: ${channel}`)
  }
  return await handler(...args)
}

export const listRegisteredIpcHandlers = (): (keyof IpcHandlerMap)[] => {
  return [...ipcHandlerRegistry.keys()]
}

type InitIpcFn = (app: Electron.App, state: AppState, server: ModbusServer) => void

export const initIpc: InitIpcFn = (app, _state, server) => {
  // Server
  ipcHandle('add_replace_server_register', (_, params) => server.addRegister(params))
  ipcHandle('remove_server_register', (_, params) => server.removeRegister(params))
  ipcHandle('sync_server_register', (_, params) => server.syncServerRegisters(params))
  ipcHandle('reset_registers', (_, params) => server.resetRegisters(params))
  ipcHandle('set_bool', (_, params) => server.setBool(params))
  ipcHandle('reset_bools', (_, params) => server.resetBools(params))
  ipcHandle('sync_bools', (_, params) => server.syncBools(params))
  ipcHandle('reset_server', (_, uuid) => server.resetServer(uuid))
  ipcHandle('set_server_port', (_, params) => server.setPort(params))
  ipcHandle('create_server', (_, params) => server.createServer(params))
  ipcHandle('delete_server', (_, uuid) => server.deleteServer(uuid))

  ipcHandle('start_comm_monitor', () => server.getTrafficMonitor().start())
  ipcHandle('stop_comm_monitor', () => server.getTrafficMonitor().stop())
  ipcHandle('clear_comm_monitor', () => server.getTrafficMonitor().clear())
  ipcHandle('export_comm_log', (_, filepath: string) =>
    server.getTrafficMonitor().exportToFile(filepath)
  )
  ipcHandle('get_comm_stats', () => server.getTrafficMonitor().getStats())
  ipcHandle('read_text_file', async (_, absolutePath: string) => {
    const fs = await import('fs/promises')
    return await fs.readFile(absolutePath, 'utf8')
  })
  ipcHandle('write_text_file', async (_, absolutePath: string, content: string) => {
    const fs = await import('fs/promises')
    await fs.writeFile(absolutePath, content, 'utf8')
  })
  ipcHandle('pick_workspace_file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Workspace',
      properties: ['openFile'],
      filters: [{ name: 'Modbux Workspace', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcHandle('get_app_version', () => app.getVersion())

  ipcHandle('list_serial_ports', async () => {
    try {
      const { SerialPort } = await import('serialport')
      const ports = await SerialPort.list()
      console.log('[SerialPort] Scanned ports:', ports)
      return ports.map((port) => ({
        path: port.path,
        manufacturer: port.manufacturer
      }))
    } catch (error) {
      console.error('[SerialPort] Error scanning ports:', error)
      throw error
    }
  })

  ipcHandle('validate_serial_port', async (_, portPath: string) => {
    try {
      const { SerialPort } = await import('serialport')
      const ports = await SerialPort.list()
      const exists = ports.some((p) => p.path === portPath)
      return {
        valid: exists,
        message: exists ? 'Port exists' : 'Port not found'
      }
    } catch (error) {
      return {
        valid: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Excel Import/Export
  ipcHandle('export_server_data', async (_, params) => {
    const fs = await import('fs')
    const { exportToExcel } = await import('../shared/utils/excel')

    try {
      const serverData = server.getServerData(params.uuid)
      if (!serverData) {
        return { success: false, filePath: params.filePath, rowCount: 0, error: 'Server not found' }
      }

      const rows: Array<{
        Address: number
        'Unit ID': number
        Value: boolean | number
        'Data Type': string
        Comment: string
        'Register Type': string
      }> = []

      serverData.forEach((data, unitId) => {
        const unitIdNum = parseInt(unitId, 10)

        data.coils.forEach((value, addr) => {
          rows.push({
            Address: addr,
            'Unit ID': unitIdNum,
            Value: value,
            'Data Type': 'none',
            Comment: '',
            'Register Type': 'coils'
          })
        })

        data.discrete_inputs.forEach((value, addr) => {
          rows.push({
            Address: addr,
            'Unit ID': unitIdNum,
            Value: value,
            'Data Type': 'none',
            Comment: '',
            'Register Type': 'discrete_inputs'
          })
        })

        data.holding_registers.forEach((value, addr) => {
          rows.push({
            Address: addr,
            'Unit ID': unitIdNum,
            Value: value,
            'Data Type': 'uint16',
            Comment: '',
            'Register Type': 'holding_registers'
          })
        })

        data.input_registers.forEach((value, addr) => {
          rows.push({
            Address: addr,
            'Unit ID': unitIdNum,
            Value: value,
            'Data Type': 'uint16',
            Comment: '',
            'Register Type': 'input_registers'
          })
        })
      })

      const format: 'xlsx' | 'xls' = params.filePath.endsWith('.xls') ? 'xls' : 'xlsx'
      const result = exportToExcel(
        {
          serverId: params.uuid,
          unitId: 1,
          coils: [],
          discrete_inputs: [],
          holding_registers: [],
          input_registers: []
        },
        { format }
      )

      if (result.success) {
        fs.writeFileSync(params.filePath, result.buffer)
      }

      return {
        success: result.success,
        filePath: params.filePath,
        rowCount: rows.length,
        error: result.error
      }
    } catch (error) {
      return {
        success: false,
        filePath: params.filePath,
        rowCount: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcHandle('import_server_data', async (_, params) => {
    const fs = await import('fs')

    try {
      fs.readFileSync(params.filePath)
      return {
        success: true,
        importedCount: 0,
        errors: [],
        warnings: ['Import not fully implemented yet']
      }
    } catch (error) {
      return {
        success: false,
        importedCount: 0,
        errors: [{ row: 0, message: error instanceof Error ? error.message : String(error) }],
        warnings: []
      }
    }
  })

  ipcHandle('create_excel_template', async (_, params) => {
    const fs = await import('fs')

    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()

      const headers = [['Address', 'Unit ID', 'Value', 'Data Type', 'Comment', 'Register Type']]
      const worksheet = XLSX.utils.aoa_to_sheet(headers)
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Template')

      const format = params.format || 'xlsx'
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: format })

      fs.writeFileSync(params.filePath, Buffer.from(buffer))

      return {
        success: true,
        filePath: params.filePath
      }
    } catch (error) {
      return {
        success: false,
        filePath: params.filePath,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}

export function onIpcEvent<E extends IpcEvent>(
  event: E,
  listener: (event: IpcMainEvent, ...args: IpcEventPayloadMap[E]) => void
): void {
  ipcMain.on(event, (ev, ...args) => {
    listener(ev, ...(args as IpcEventPayloadMap[E]))
  })
}

export function offIpcEvent<E extends IpcEvent>(event: E): void {
  ipcMain.removeAllListeners(event)
}
