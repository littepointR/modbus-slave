import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppState } from '../state'

const { ipcHandleMock, ipcRemoveHandlerMock } = vi.hoisted(() => ({
  ipcHandleMock: vi.fn(),
  ipcRemoveHandlerMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcHandleMock,
    removeHandler: ipcRemoveHandlerMock,
    on: vi.fn(),
    removeAllListeners: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })
  }
}))

import { initIpc, listRegisteredIpcHandlers } from '../ipc'

describe('initIpc', () => {
  beforeEach(() => {
    ipcHandleMock.mockClear()
    ipcRemoveHandlerMock.mockClear()
  })

  it('registers legacy client compatibility handlers', () => {
    const app = { getVersion: () => '2.1.0' } as Electron.App
    const state = new AppState()
    const server = {
      addRegister: vi.fn(),
      removeRegister: vi.fn(),
      syncServerRegisters: vi.fn(),
      resetRegisters: vi.fn(),
      setBool: vi.fn(),
      resetBools: vi.fn(),
      syncBools: vi.fn(),
      resetServer: vi.fn(),
      setPort: vi.fn(),
      createServer: vi.fn(),
      deleteServer: vi.fn(),
      getTrafficMonitor: vi.fn().mockReturnValue({
        start: vi.fn(),
        stop: vi.fn(),
        clear: vi.fn(),
        exportToFile: vi.fn(),
        getStats: vi.fn(),
        setMaxBufferBytes: vi.fn(),
        getMaxBufferBytes: vi.fn().mockReturnValue(100 * 1024 * 1024)
      }),
      getServerData: vi.fn().mockReturnValue(new Map())
    } as unknown as import('../modules/mobusServer').ModbusServer

    initIpc(app, state, server)

    const channels = listRegisteredIpcHandlers()
    expect(channels).toContain('update_connection_config')
    expect(channels).toContain('update_register_config')
    expect(channels).toContain('stop_scanning_unit_ids')
    expect(channels).toContain('get_comm_packets')
    expect(channels).toContain('set_window_always_on_top')
    expect(channels).toContain('get_window_always_on_top')
  })
})
