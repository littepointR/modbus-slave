import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initIpc, onIpcEvent } from './ipc'
import { AppState } from './state'
import os from 'os'
import { ModbusServer } from './modules/mobusServer'
import { Windows } from '@shared'
import type {
  RegisterPlotData,
  RegisterPlotWindowInit,
  ScriptEditorApplyPayload,
  ScriptEditorRunPayload,
  ScriptEditorWindowInit
} from '@shared'
import { startCliApiServerWithOptions, stopCliApiServer } from './cliApi'
import { CliWorkspaceRuntime } from './modules/cliWorkspace'
import { SystemLogger } from './modules/systemLogger'

if (is.dev && os.platform() === 'darwin') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

const windows = new Windows()
const systemLogger = new SystemLogger(windows, join(app.getPath('userData'), 'logs'))
systemLogger.log({
  level: 'info',
  source: 'system',
  module: 'main',
  message: 'System logger initialized'
})

// Initialize the app state
const appState = new AppState()

// Initialize the modbus server
const server = new ModbusServer({ windows, logger: systemLogger })
const cliWorkspaceRuntime = new CliWorkspaceRuntime(server, systemLogger)

// IPC
initIpc(app, appState, server, systemLogger)

// Single instance - DISABLED for multi-instance dev mode
// DISABLE_SINGLE_INSTANCE
if (false) {
  // disabled for multi-instance dev
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (windows.main) {
      if (windows.main.isMinimized()) windows.main.restore()
      windows.main.focus()
    }
  })
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  windows.main = new BrowserWindow({
    width: 1480,
    height: 1000,
    minWidth: 820,
    minHeight: 800,
    autoHideMenuBar: true,
    show: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'Modbux',
    icon: join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#181818'
  })

  windows.main.on('ready-to-show', () => {
    if (windows.main === null) return
    windows.main.show()
  })

  windows.main.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  windows.main.on('close', () => {
    windows.server?.close()
    scriptEditorWindow?.close()
    registerPlotWindows.forEach((plotWindow) => plotWindow.close())
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    windows.main.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    windows.main.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return windows.main
}

//
//
// SERVER WINDOW
onIpcEvent('open_server_window', () => {
  if (!windows.main) return
  if (windows.server) return

  windows.server = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 820,
    minHeight: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: ['is-server-window']
    },
    title: 'Server',
    backgroundColor: '#181818'
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    windows.server.loadURL(`${process.env['ELECTRON_RENDERER_URL']}`)
  } else {
    windows.server.loadFile(join(__dirname, '../renderer/index.html'))
  }

  windows.server.on('close', () => {
    windows.server = null
  })
})

onIpcEvent('open_comm_log_window', () => {
  if (windows.commLog) {
    windows.commLog.focus()
    return
  }

  windows.commLog = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: ['is-comm-log-window']
    },
    title: 'Communication Details',
    backgroundColor: '#181818'
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    windows.commLog.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/comm-log`)
  } else {
    windows.commLog.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '#/comm-log'
    })
  }

  windows.commLog.on('close', () => {
    windows.commLog = null
  })
})

const registerPlotWindows = new Map<string, BrowserWindow>()
let scriptEditorWindow: BrowserWindow | null = null
let scriptEditorConnectionId: string | null = null

onIpcEvent('open_register_plot_window', (_event, payload: RegisterPlotWindowInit) => {
  const win = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 760,
    minHeight: 480,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: ['is-register-plot-window']
    },
    title: payload.title,
    backgroundColor: '#181818'
  })

  registerPlotWindows.set(payload.chartId, win)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.webContents.send('register_plot_init', payload)
      }
    }, 200)
  })

  win.on('closed', () => {
    registerPlotWindows.delete(payload.chartId)
    windows.send('register_plot_window_closed', payload.chartId)
  })
})

onIpcEvent('register_plot_data', (_event, payload: RegisterPlotData) => {
  const plotWin = registerPlotWindows.get(payload.chartId)
  if (!plotWin || plotWin.isDestroyed() || plotWin.webContents.isDestroyed()) return
  plotWin.webContents.send('register_plot_data', payload)
})

onIpcEvent('close_register_plot_windows', () => {
  registerPlotWindows.forEach((plotWin) => {
    if (!plotWin.isDestroyed()) plotWin.close()
  })
})

onIpcEvent('open_script_editor_window', (_event, payload: ScriptEditorWindowInit) => {
  if (!windows.main) return

  const reopenRequired =
    !scriptEditorWindow ||
    scriptEditorWindow.isDestroyed() ||
    scriptEditorConnectionId !== payload.connectionId

  if (reopenRequired) {
    if (scriptEditorWindow && !scriptEditorWindow.isDestroyed()) {
      scriptEditorWindow.close()
    }

    scriptEditorWindow = new BrowserWindow({
      width: 1120,
      height: 760,
      minWidth: 900,
      minHeight: 560,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        additionalArguments: ['is-script-editor-window']
      },
      title: `Script Editor - ${payload.connectionAlias}`,
      backgroundColor: '#181818'
    })

    scriptEditorConnectionId = payload.connectionId

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      scriptEditorWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}`)
    } else {
      scriptEditorWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    scriptEditorWindow.on('closed', () => {
      windows.send('script_editor_window_closed', payload.connectionId)
      scriptEditorWindow = null
      scriptEditorConnectionId = null
    })
  }

  const editorWindow = scriptEditorWindow
  if (!editorWindow) return

  editorWindow.focus()
  editorWindow.webContents.once('did-finish-load', () => {
    if (!editorWindow.isDestroyed()) {
      editorWindow.webContents.send('script_editor_init', payload)
    }
  })
})

onIpcEvent('script_editor_apply', (_event, payload: ScriptEditorApplyPayload) => {
  if (!windows.main || windows.main.isDestroyed()) return
  windows.main.webContents.send('script_editor_apply', payload)
})

onIpcEvent('script_editor_run_once', (_event, payload: ScriptEditorRunPayload) => {
  if (!windows.main || windows.main.isDestroyed()) return
  windows.main.webContents.send('script_editor_run_once', payload)
})

let splash: BrowserWindow | null = null

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (os.platform() !== 'darwin') {
    splash = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      resizable: false,
      show: false,
      backgroundColor: '#181818',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    splash.loadFile(join(__dirname, '../../resources/splash.html')).catch(console.error)

    splash.on('ready-to-show', () => {
      splash?.show()
    })
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.harted')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  void startCliApiServerWithOptions(app, {
    dispatchUiAction: (action, payload) => cliWorkspaceRuntime.dispatch(action, payload)
  }).catch((error) => {
    console.error('[CLI API] failed to start:', error)
  })

  const mainWindow = createWindow()

  mainWindow.once('ready-to-show', () => {
    if (splash) splash.close()
    splash = null
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  windows.server = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void stopCliApiServer()
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
