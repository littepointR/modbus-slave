import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { resolve } from 'path'

let app: ElectronApplication
let page: Page

const CONN_ALIAS = 'QA Connection'
const CONN_ALIAS_EDITED = 'QA Connection Edited'
const SLAVE_ALIAS = 'QA Slave'

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
    await page.getByLabel('Port').fill('502')

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

    await commPage.getByRole('button', { name: /停止|Stop/ }).click()
    await expect(commPage.getByRole('button', { name: /继续|Continue/ })).toBeEnabled()

    await commPage.getByRole('button', { name: /继续|Continue/ }).click()
    await expect(commPage.getByRole('button', { name: /停止|Stop/ })).toBeEnabled()
  })
})
