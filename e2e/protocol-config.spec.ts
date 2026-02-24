import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  clickEditConnectionAction,
  closeApp,
  createConnectionViaDialog,
  launchMainWindow,
  openAndCloseConnection,
  selectConnectionMode
} from './helpers/server-e2e'

let app: ElectronApplication
let page: Page

const MODE_TCP_ALIAS = 'QA Mode TCP'
const MODE_UDP_ALIAS = 'QA Mode UDP'
const MODE_RTU_TCP_ALIAS = 'QA Mode RTU/TCP'
const MODE_RTU_UDP_ALIAS = 'QA Mode RTU/UDP'
const MODE_RTU_ALIAS = 'QA Mode RTU'
const MODE_ASCII_ALIAS = 'QA Mode ASCII'

test.beforeAll(async () => {
  const launched = await launchMainWindow()
  app = launched.app
  page = launched.page
})

test.afterAll(async () => {
  await closeApp(app)
})

test.describe.serial('Server Protocol And Config E2E', () => {
  test('covers all communication modes through e2e flows', async () => {
    await createConnectionViaDialog({
      page,
      alias: MODE_TCP_ALIAS,
      mode: 'tcp',
      port: 15120
    })
    await openAndCloseConnection(page, MODE_TCP_ALIAS)

    await createConnectionViaDialog({
      page,
      alias: MODE_UDP_ALIAS,
      mode: 'udp',
      port: 15121
    })
    await openAndCloseConnection(page, MODE_UDP_ALIAS)

    await createConnectionViaDialog({
      page,
      alias: MODE_RTU_TCP_ALIAS,
      mode: 'rtuovertcp',
      port: 15122
    })
    await openAndCloseConnection(page, MODE_RTU_TCP_ALIAS)

    await createConnectionViaDialog({
      page,
      alias: MODE_RTU_UDP_ALIAS,
      mode: 'rtuoverudp',
      port: 15123
    })
    await openAndCloseConnection(page, MODE_RTU_UDP_ALIAS)

    await createConnectionViaDialog({
      page,
      alias: MODE_RTU_ALIAS,
      mode: 'rtu',
      frameFormat: 'rtu'
    })

    await createConnectionViaDialog({
      page,
      alias: MODE_ASCII_ALIAS,
      mode: 'rtu',
      frameFormat: 'ascii'
    })
  })

  test('covers connection config changes across protocols', async () => {
    await page.getByText(MODE_TCP_ALIAS, { exact: true }).click()
    await clickEditConnectionAction(page)
    await expect(page.getByRole('heading', { name: /编辑连接|Edit Connection/ })).toBeVisible()

    await selectConnectionMode(page, 'udp')
    await page.getByLabel('IP Address').fill('127.0.0.1')
    await page.getByLabel('Port').fill('15130')
    await page.getByRole('button', { name: /保存|Save/ }).click()

    await openAndCloseConnection(page, MODE_TCP_ALIAS)

    await page.getByText(MODE_TCP_ALIAS, { exact: true }).click()
    await clickEditConnectionAction(page)
    await selectConnectionMode(page, 'rtuovertcp')
    await page.getByLabel('IP Address').fill('127.0.0.1')
    await page.getByLabel('Port').fill('15131')
    await page.getByRole('button', { name: /保存|Save/ }).click()

    await openAndCloseConnection(page, MODE_TCP_ALIAS)

    await page.getByText(MODE_RTU_ALIAS, { exact: true }).click()
    await clickEditConnectionAction(page)
    await page.getByLabel('ASCII').check()
    await page.getByRole('button', { name: /保存|Save/ }).click()

    await page.getByText(MODE_RTU_ALIAS, { exact: true }).click()
    await clickEditConnectionAction(page)
    await expect(page.getByLabel('ASCII')).toBeChecked()
    await page.getByRole('button', { name: /取消|Cancel/ }).click()
  })
})
