import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { resolve } from 'path'
import net from 'net'

let app: ElectronApplication
let page: Page

const CONN_ALIAS = 'QA Connection'
const CONN_ALIAS_EDITED = 'QA Connection Edited'
const SLAVE_ALIAS = 'QA Slave'
const CONN_PORT = 15020
const MODE_TCP_ALIAS = 'QA Mode TCP'
const MODE_UDP_ALIAS = 'QA Mode UDP'
const MODE_RTU_TCP_ALIAS = 'QA Mode RTU/TCP'
const MODE_RTU_UDP_ALIAS = 'QA Mode RTU/UDP'
const MODE_RTU_ALIAS = 'QA Mode RTU'
const MODE_ASCII_ALIAS = 'QA Mode ASCII'
const MATRIX_SLAVE_ALIAS = 'QA Matrix Slave'

type UiConnectionMode = 'tcp' | 'udp' | 'rtuovertcp' | 'rtuoverudp' | 'rtu'

const selectConnectionMode = async (mode: UiConnectionMode): Promise<void> => {
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

const createConnectionViaDialog = async ({
  alias,
  mode,
  port,
  frameFormat = 'rtu'
}: {
  alias: string
  mode: UiConnectionMode
  port?: number
  frameFormat?: 'rtu' | 'ascii'
}): Promise<void> => {
  await page.getByRole('button', { name: /新建连接|New Connection/ }).click()
  await expect(page.getByRole('heading', { name: /新建连接|New Connection/ })).toBeVisible()

  await page.getByLabel('Connection Alias').fill(alias)
  await selectConnectionMode(mode)

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

const openAndCloseConnection = async (alias: string): Promise<void> => {
  await page.getByText(alias, { exact: true }).click()
  await page.getByRole('button', { name: /打开连接|Open Connection/ }).click()
  await expect(page.getByRole('button', { name: /关闭连接|Close Connection/ })).toBeEnabled()
  await page.getByRole('button', { name: /关闭连接|Close Connection/ }).click()
  await expect(page.getByRole('button', { name: /打开连接|Open Connection/ })).toBeEnabled()
}

const sendReadHoldingRegisters = async (
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

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(__dirname, '../out/main/index.js')]
  })

  await app.evaluate(async (ctx) => {
    await ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] })
  })

  for (let i = 0; i < 10; i++) {
    const windows = app.windows()
    for (const win of windows) {
      const title = await win.title()
      if (title === 'Modbux') {
        page = win
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(500)
        return
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  throw new Error('Main Modbux window not found')
})

test.afterAll(async () => {
  await app?.close()
})

test.describe.serial('Server-Centric E2E', () => {
  test('app launches and shows server toolbar', async () => {
    expect(await page.title()).toBe('Modbux')
    await expect(page.getByRole('button', { name: /新建连接|New Connection/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /新建从站|New Slave/ })).toBeVisible()
    await expect(page.getByText('Connections', { exact: true })).toBeVisible()
  })

  test('can create a TCP connection', async () => {
    await page.getByRole('button', { name: /新建连接|New Connection/ }).click()
    await expect(page.getByRole('heading', { name: /新建连接|New Connection/ })).toBeVisible()

    await page.getByLabel('Connection Alias').fill(CONN_ALIAS)
    await page.getByLabel('IP Address').fill('127.0.0.1')
    await page.getByLabel('Port').fill(String(CONN_PORT))

    await page.getByRole('button', { name: /确定|OK/ }).click()
    await expect(page.getByText(CONN_ALIAS, { exact: true })).toBeVisible()
  })

  test('can open, close and edit connection', async () => {
    await page.getByText(CONN_ALIAS, { exact: true }).click()

    await page.getByRole('button', { name: /打开连接|Open Connection/ }).click()
    await expect(page.getByRole('button', { name: /关闭连接|Close Connection/ })).toBeEnabled()

    await page.getByRole('button', { name: /关闭连接|Close Connection/ }).click()
    await expect(page.getByRole('button', { name: /打开连接|Open Connection/ })).toBeEnabled()

    await page.getByRole('button', { name: /编辑连接|Edit Connection/ }).click()
    await expect(page.getByRole('heading', { name: /编辑连接|Edit Connection/ })).toBeVisible()

    await page.getByLabel('Connection Alias').fill(CONN_ALIAS_EDITED)
    await page.getByRole('button', { name: /保存|Save/ }).click()

    await expect(page.getByText(CONN_ALIAS_EDITED, { exact: true })).toBeVisible()
  })

  test('can add a slave and open default register group tab', async () => {
    await page.getByText(CONN_ALIAS_EDITED, { exact: true }).click()
    await page.getByRole('button', { name: /新建从站|New Slave/ }).click()

    await expect(page.getByRole('heading', { name: /新建从站|New Slave/ })).toBeVisible()
    await page.getByLabel('Slave Alias').fill(SLAVE_ALIAS)
    await page.getByLabel('Slave ID').fill('2')
    await page.getByRole('button', { name: /确定|OK/ }).click()

    await expect(page.getByText(`${SLAVE_ALIAS} (ID:2)`)).toBeVisible()
    await page.getByText('Default Group', { exact: true }).dblclick()

    await expect(page.getByRole('tab', { name: /Default Group/ })).toBeVisible()
    await expect(page.getByText('Type: Holding Register (4x)')).toBeVisible()
    await expect(page.getByText(`Connection: ${CONN_ALIAS_EDITED}`)).toBeVisible()
    await expect(page.getByText(`Slave: ${SLAVE_ALIAS}`)).toBeVisible()
  })

  test('can edit register value and switch interpretation tabs', async () => {
    const firstValueInput = page.locator('tbody tr').first().locator('input[type="number"]').first()
    await firstValueInput.fill('123')
    await expect(firstValueInput).toHaveValue('123')

    const longTab = page.getByRole('tab', { name: 'Long' })
    await longTab.click()
    await expect(longTab).toHaveAttribute('aria-selected', 'true')

    const floatTab = page.getByRole('tab', { name: 'Float' })
    await floatTab.click()
    await expect(floatTab).toHaveAttribute('aria-selected', 'true')

    const stringTab = page.getByRole('tab', { name: 'String' })
    await stringTab.click()
    await expect(stringTab).toHaveAttribute('aria-selected', 'true')
  })

  test('can open communication log window', async () => {
    await page.getByText(CONN_ALIAS_EDITED, { exact: true }).click()
    await page.getByRole('button', { name: /打开连接|Open Connection/ }).click()
    await expect(page.getByRole('button', { name: /关闭连接|Close Connection/ })).toBeEnabled()

    await page.getByRole('button', { name: /通讯详情|Communication Details/ }).click()

    await expect.poll(async () => app.windows().length).toBeGreaterThan(1)

    const windows = app.windows()
    const commPage = windows[windows.length - 1]
    await commPage.waitForLoadState('domcontentloaded')

    await expect(commPage.getByText(/通讯日志|Transaction Log/)).toBeVisible()
    await expect(commPage.getByText(/暂无通讯数据|No communication data/)).toBeVisible()

    await expect(commPage.getByRole('button', { name: /继续|Continue/ })).toBeVisible()
    await expect(commPage.getByRole('button', { name: /停止|Stop/ })).toBeVisible()
    await expect(commPage.getByRole('button', { name: /清空|Clear/ })).toBeVisible()
    await expect(commPage.getByRole('button', { name: /保存|Save/ })).toBeDisabled()

    const response = await sendReadHoldingRegisters('127.0.0.1', CONN_PORT, 2, 0, 2)
    expect(response.length).toBeGreaterThan(0)

    await expect(
      commPage.getByText(/RX\s+\|\s+Unit:002\s+\|\s+00 01 00 00 00 06 02 03 00 00 00 02/)
    ).toBeVisible()
    await expect(commPage.getByRole('button', { name: /保存|Save/ })).toBeEnabled()

    await commPage.getByRole('button', { name: /停止|Stop/ }).click()
    await expect(commPage.getByRole('button', { name: /继续|Continue/ })).toBeEnabled()

    await commPage.getByRole('button', { name: /继续|Continue/ }).click()
    await expect(commPage.getByRole('button', { name: /停止|Stop/ })).toBeEnabled()
  })

  test('covers all communication modes through e2e flows', async () => {
    await createConnectionViaDialog({
      alias: MODE_TCP_ALIAS,
      mode: 'tcp',
      port: 15120
    })
    await openAndCloseConnection(MODE_TCP_ALIAS)

    await createConnectionViaDialog({
      alias: MODE_UDP_ALIAS,
      mode: 'udp',
      port: 15121
    })
    await openAndCloseConnection(MODE_UDP_ALIAS)

    await createConnectionViaDialog({
      alias: MODE_RTU_TCP_ALIAS,
      mode: 'rtuovertcp',
      port: 15122
    })
    await openAndCloseConnection(MODE_RTU_TCP_ALIAS)

    await createConnectionViaDialog({
      alias: MODE_RTU_UDP_ALIAS,
      mode: 'rtuoverudp',
      port: 15123
    })
    await openAndCloseConnection(MODE_RTU_UDP_ALIAS)

    await createConnectionViaDialog({
      alias: MODE_RTU_ALIAS,
      mode: 'rtu',
      frameFormat: 'rtu'
    })

    await createConnectionViaDialog({
      alias: MODE_ASCII_ALIAS,
      mode: 'rtu',
      frameFormat: 'ascii'
    })
  })

  test('covers connection config changes across protocols', async () => {
    await page.getByText(MODE_TCP_ALIAS, { exact: true }).click()
    await page.getByRole('button', { name: /编辑连接|Edit Connection/ }).click()
    await expect(page.getByRole('heading', { name: /编辑连接|Edit Connection/ })).toBeVisible()

    await selectConnectionMode('udp')
    await page.getByLabel('IP Address').fill('127.0.0.1')
    await page.getByLabel('Port').fill('15130')
    await page.getByRole('button', { name: /保存|Save/ }).click()

    await openAndCloseConnection(MODE_TCP_ALIAS)

    await page.getByText(MODE_TCP_ALIAS, { exact: true }).click()
    await page.getByRole('button', { name: /编辑连接|Edit Connection/ }).click()
    await selectConnectionMode('rtuovertcp')
    await page.getByLabel('IP Address').fill('127.0.0.1')
    await page.getByLabel('Port').fill('15131')
    await page.getByRole('button', { name: /保存|Save/ }).click()

    await openAndCloseConnection(MODE_TCP_ALIAS)

    await page.getByText(MODE_RTU_ALIAS, { exact: true }).click()
    await page.getByRole('button', { name: /编辑连接|Edit Connection/ }).click()
    await page.getByLabel('ASCII').check()
    await page.getByRole('button', { name: /保存|Save/ }).click()

    await page.getByText(MODE_RTU_ALIAS, { exact: true }).click()
    await page.getByRole('button', { name: /编辑连接|Edit Connection/ }).click()
    await expect(page.getByLabel('ASCII')).toBeChecked()
    await page.getByRole('button', { name: /取消|Cancel/ }).click()
  })

  test('covers all register group types in slave config and runtime tabs', async () => {
    await page.getByText(CONN_ALIAS_EDITED, { exact: true }).click()
    await page.getByRole('button', { name: /新建从站|New Slave/ }).click()
    await expect(page.getByRole('heading', { name: /新建从站|New Slave/ })).toBeVisible()

    await page.getByLabel('Slave Alias').fill(MATRIX_SLAVE_ALIAS)
    await page.getByLabel('Slave ID').fill('3')

    await page.getByLabel('Group Name').first().fill('Coil Group')
    const slaveDialog = page.getByRole('dialog')
    await slaveDialog.locator('div[role="combobox"]').nth(2).click()
    await page.getByRole('option', { name: /01 Coil \(0x\) R\/W/ }).click()

    await page.getByRole('button', { name: 'Add Register Group' }).click()
    await page.getByLabel('Group Name').nth(1).fill('Discrete Group')
    await slaveDialog.locator('div[role="combobox"]').nth(3).click()
    await page.getByRole('option', { name: /02 Discrete Input \(1x\) Read-only/ }).click()

    await page.getByRole('button', { name: 'Add Register Group' }).click()
    await page.getByLabel('Group Name').nth(2).fill('Holding Group')
    await slaveDialog.locator('div[role="combobox"]').nth(4).click()
    await page.getByRole('option', { name: /03 Holding Register \(4x\) R\/W/ }).click()

    await page.getByRole('button', { name: 'Add Register Group' }).click()
    await page.getByLabel('Group Name').nth(3).fill('Input Group')
    await slaveDialog.locator('div[role="combobox"]').nth(5).click()
    await page.getByRole('option', { name: /04 Input Register \(3x\) Read-only/ }).click()

    await page.getByRole('button', { name: /确定|OK/ }).click()
    await expect(page.getByText(`${MATRIX_SLAVE_ALIAS} (ID:3)`)).toBeVisible()

    const groups: Array<{ name: string; typeHint: RegExp }> = [
      { name: 'Coil Group', typeHint: /Type:\s*Coil\s*\(0x\)/ },
      { name: 'Discrete Group', typeHint: /Type:\s*Discrete Input\s*\(1x\)/ },
      { name: 'Holding Group', typeHint: /Type:\s*Holding Register\s*\(4x\)/ },
      { name: 'Input Group', typeHint: /Type:\s*Input Register\s*\(3x\)/ }
    ]

    for (const group of groups) {
      await page.getByText(group.name, { exact: true }).dblclick()
      await expect(page.getByRole('tab', { name: group.name })).toBeVisible()
      await expect(page.getByText(group.typeHint)).toBeVisible()
      await expect(page.getByText(`Slave: ${MATRIX_SLAVE_ALIAS}`)).toBeVisible()
    }
  })
})
