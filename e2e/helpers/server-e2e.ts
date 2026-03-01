import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { resolve } from 'path'
import net from 'net'

export type UiConnectionMode = 'tcp' | 'udp' | 'rtuovertcp' | 'rtuoverudp' | 'rtu'

export const launchMainWindow = async (): Promise<{ app: ElectronApplication; page: Page }> => {
  const app = await electron.launch({
    args: [resolve(__dirname, '../../out/main/index.js')]
  })

  await app.evaluate(async (ctx) => {
    await ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] })
  })

  for (let i = 0; i < 10; i++) {
    const windows = app.windows()
    for (const win of windows) {
      const title = await win.title()
      if (title.includes('Modbus Slave')) {

        await win.waitForLoadState('domcontentloaded')
        await win.waitForTimeout(500)
        return { app, page: win }
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  await app.close()
  throw new Error('Main Modbus Slave window not found')
}

export const closeApp = async (app: ElectronApplication | undefined): Promise<void> => {
  if (!app) return
  await app.evaluate((ctx) => {
    const wins = ctx.BrowserWindow.getAllWindows()
    wins.forEach((w: any) => {
      w.__modbusSlaveAllowClose = true
    })
  })
  await app.close()
}

export const sendReadHoldingRegisters = async (
  host: string,
  port: number,
  unitId: number,
  address: number,
  quantity: number
): Promise<Buffer> =>
  await new Promise((resolvePromise, reject) => {
    const socket = new net.Socket()
    const request = Buffer.from([
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x06,
      unitId & 0xff,
      0x03,
      (address >> 8) & 0xff,
      address & 0xff,
      (quantity >> 8) & 0xff,
      quantity & 0xff
    ])

    socket.setTimeout(5000)
    socket.connect(port, host, () => socket.write(request))
    socket.once('data', (data) => {
      resolvePromise(Buffer.from(data))
      socket.destroy()
    })
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('TCP request timeout'))
    })
    socket.once('error', (error) => {
      socket.destroy()
      reject(error)
    })
  })

export const selectConnectionMode = async (page: Page, mode: UiConnectionMode): Promise<void> => {
  const labels: Record<UiConnectionMode, string> = {
    tcp: 'Modbus TCP/IP',
    udp: 'Modbus UDP/IP',
    rtuovertcp: 'Modbus RTU Over TCP/IP',
    rtuoverudp: 'Modbus RTU Over UDP/IP',
    rtu: 'Modbus RTU'
  }

  const dialog = page.getByRole('dialog')
  await dialog.locator('div[role="combobox"]').first().click()
  await page.getByRole('option', { name: labels[mode], exact: true }).click()
}

export const createConnectionViaDialog = async ({
  page,
  alias,
  mode,
  port,
  frameFormat = 'rtu'
}: {
  page: Page
  alias: string
  mode: UiConnectionMode
  port?: number
  frameFormat?: 'rtu' | 'ascii'
}): Promise<void> => {
  await clickNewConnectionAction(page)
  await expect(page.getByRole('heading', { name: /新建连接|New Connection/ })).toBeVisible()

  await page.getByLabel('Connection Alias').fill(alias)
  await selectConnectionMode(page, mode)

  if (mode === 'rtu') {
    await page
      .getByRole('combobox', { name: 'Serial Port' })
      .fill(`/dev/tty.${alias.replace(/\s+/g, '-').toLowerCase()}`)
    if (frameFormat === 'ascii') {
      await page.getByLabel('ASCII').check()
    } else {
      await page.getByLabel('RTU').check()
    }
  } else {
    await page.getByLabel('IP Address').fill('127.0.0.1')
    await page.getByLabel('Port').fill(String(port ?? 502))
  }

  await page.getByRole('button', { name: /确定|OK/ }).click()
  await expect(page.getByText(alias, { exact: true })).toBeVisible()
}

export const openAndCloseConnection = async (page: Page, alias: string): Promise<void> => {
  await page.getByText(alias, { exact: true }).click()
  
  // Robust wait for the Disconnect menu item to become enabled
  let isEnabled = false
  for (let attempt = 0; attempt < 3; attempt++) {
    await clickOpenConnectionAction(page)
    
    for (let i = 0; i < 10; i++) {
      await openConnectionMenu(page)
      const item = page.getByRole('menuitem', { name: /^(断开|Disconnect)/ }).first()
      try {
        await expect(item).toBeEnabled({ timeout: 1000 })
        isEnabled = true
        break
      } catch {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(1000)
      }
    }
    if (isEnabled) break
  }
  
  if (!isEnabled) {
    throw new Error(`Connection "${alias}" failed to open (Disconnect button stayed disabled)`)
  }

  await clickMenuAction(page, /^(断开|Disconnect)/)
}

const openConnectionMenu = async (page: Page): Promise<void> => {
  const btn = page.getByRole('button', { name: /^(连接|Connection)$/ })
  await btn.click()
  // Ensure the menu actually appeared
  try {
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 2000 })
  } catch {
    // Retry once if menu didn't open
    await btn.click()
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 2000 })
  }
}

const clickMenuAction = async (page: Page, name: RegExp): Promise<void> => {
  const item = page.getByRole('menuitem', { name }).first()
  await item.click()
}

export const clickNewConnectionAction = async (page: Page): Promise<void> => {
  await openConnectionMenu(page)
  await clickMenuAction(page, /新建连接|New Connection/)
}

export const clickNewSlaveAction = async (page: Page): Promise<void> => {
  await openConnectionMenu(page)
  await clickMenuAction(page, /新建从站|New Slave/)
}

export const clickOpenConnectionAction = async (page: Page): Promise<void> => {
  await openConnectionMenu(page)
  await clickMenuAction(page, /^(连接|Connect)/)
}

export const clickCloseConnectionAction = async (page: Page): Promise<void> => {
  await openConnectionMenu(page)
  await clickMenuAction(page, /^(断开|Disconnect)/)
}

export const clickEditConnectionAction = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /工具|Tools/ }).click()
  await clickMenuAction(page, /编辑连接|Edit Connection/)
}
