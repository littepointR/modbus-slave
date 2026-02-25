import { AppState } from './state'
import { IpcHandlerMap, IpcEvent, IpcEventPayloadMap } from '@shared'
import { ModbusServer } from './modules/mobusServer'
import { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, dialog, ipcMain } from 'electron'
import { defaultClientState, type ClientState } from '@shared'
import type { SystemLogger } from './modules/systemLogger'

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

type InitIpcFn = (
  app: Electron.App,
  state: AppState,
  server: ModbusServer,
  logger?: SystemLogger
) => void

export const initIpc: InitIpcFn = (app, _state, server, logger) => {
  let clientState: ClientState = { ...defaultClientState }

  const patchClientState = (patch: Partial<ClientState>): void => {
    clientState = { ...clientState, ...patch }
  }

  // Client (legacy compatibility)
  ipcHandle('get_connection_config', () => _state.connectionConfig)
  ipcHandle('update_connection_config', (_, config) => _state.updateConnectionConfig(config))
  ipcHandle('update_register_config', (_, config) => _state.updateRegisterConfig(config))
  ipcHandle('get_client_state', () => clientState)
  ipcHandle('set_register_mapping', (_, mapping) => _state.setRegisterMapping(mapping))
  ipcHandle('connect', () => {
    patchClientState({ connectState: 'connected' })
  })
  ipcHandle('disconnect', () => {
    patchClientState({
      connectState: 'disconnected',
      polling: false,
      scanningUniId: false,
      scanningRegisters: false
    })
  })
  ipcHandle('read', () => {})
  ipcHandle('start_polling', () => {
    patchClientState({ polling: true })
  })
  ipcHandle('stop_polling', () => {
    patchClientState({ polling: false })
  })
  ipcHandle('write', () => {})
  ipcHandle('scan_unit_ids', () => {
    patchClientState({ scanningUniId: true })
  })
  ipcHandle('stop_scanning_unit_ids', () => {
    patchClientState({ scanningUniId: false })
  })
  ipcHandle('scan_registers', () => {
    patchClientState({ scanningRegisters: true })
  })
  ipcHandle('stop_scanning_registers', () => {
    patchClientState({ scanningRegisters: false })
  })

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
  ipcHandle('get_comm_packets', (_, limit?: number) => {
    const packets = server.getTrafficMonitor().getPackets()
    if (!Number.isFinite(limit)) return packets
    const normalized = Math.max(0, Math.floor(limit as number))
    if (normalized === 0) return []
    if (packets.length <= normalized) return packets
    return packets.slice(-normalized)
  })
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
  ipcHandle('append_system_log', (_, params) => {
    logger?.log(params)
  })
  ipcHandle('get_system_logs', (_, limit?: number) => {
    return logger?.getEntries(limit) ?? []
  })
  ipcHandle('get_system_log_stats', () => {
    return (
      logger?.getStats() ?? {
        total: 0,
        byLevel: { debug: 0, info: 0, warn: 0, error: 0 },
        bySource: {
          system: 0,
          comm: 0,
          script: 0,
          connection: 0,
          register: 0,
          workspace: 0,
          cli: 0
        },
        bufferBytes: 0,
        bufferLimitBytes: 0
      }
    )
  })
  ipcHandle('clear_system_logs', () => {
    logger?.clear()
  })
  ipcHandle('export_system_logs', (_, filepath: string) => {
    logger?.exportToFile(filepath)
  })
  ipcHandle('set_comm_buffer_limit_mb', (_, limitMb: number) => {
    const parsed = Number.isFinite(limitMb) ? limitMb : 100
    const normalizedMb = Math.max(1, Math.min(1024, Math.round(parsed)))
    const limitBytes = normalizedMb * 1024 * 1024
    server.getTrafficMonitor().setMaxBufferBytes(limitBytes)
    return normalizedMb
  })
  ipcHandle('get_comm_buffer_limit_mb', () => {
    return Math.max(1, Math.round(server.getTrafficMonitor().getMaxBufferBytes() / (1024 * 1024)))
  })
  ipcHandle('set_system_log_buffer_limit_mb', (_, limitMb: number) => {
    const parsed = Number.isFinite(limitMb) ? limitMb : 100
    const normalizedMb = Math.max(1, Math.min(1024, Math.round(parsed)))
    const limitBytes = normalizedMb * 1024 * 1024
    logger?.setMaxBufferBytes(limitBytes)
    return normalizedMb
  })
  ipcHandle('get_system_log_buffer_limit_mb', () => {
    return logger ? Math.max(1, Math.round(logger.getMaxBufferBytes() / (1024 * 1024))) : 100
  })

  ipcHandle('get_app_version', () => app.getVersion())
  ipcHandle('confirm_window_close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) as
      | (BrowserWindow & {
          __modbuxAllowClose?: boolean
          __modbuxCloseRequestPending?: boolean
        })
      | null
    if (!win || win.isDestroyed()) return
    win.__modbuxCloseRequestPending = false
    win.__modbuxAllowClose = true
    win.close()
  })
  ipcHandle('reject_window_close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) as
      | (BrowserWindow & {
          __modbuxCloseRequestPending?: boolean
        })
      | null
    if (!win || win.isDestroyed()) return
    win.__modbuxCloseRequestPending = false
  })
  ipcHandle('set_window_always_on_top', (event, alwaysOnTop: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return false
    win.setAlwaysOnTop(Boolean(alwaysOnTop))
    return win.isAlwaysOnTop()
  })
  ipcHandle('get_window_always_on_top', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return false
    return win.isAlwaysOnTop()
  })

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
