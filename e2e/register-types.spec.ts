import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, createConnectionViaDialog, launchMainWindow } from './helpers/server-e2e'

let app: ElectronApplication
let page: Page

const CONN_ALIAS = 'QA Register Matrix'
const MATRIX_SLAVE_ALIAS = 'QA Matrix Slave'

test.beforeAll(async () => {
  const launched = await launchMainWindow()
  app = launched.app
  page = launched.page
})

test.afterAll(async () => {
  await closeApp(app)
})

test.describe.serial('Server Register Type Matrix E2E', () => {
  test('covers all register group types in slave config and runtime tabs', async () => {
    await createConnectionViaDialog({
      page,
      alias: CONN_ALIAS,
      mode: 'tcp',
      port: 15200
    })

    await page.getByText(CONN_ALIAS, { exact: true }).click()
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
      { name: 'Coil Group', typeHint: /Type:?\s*Coil\s*\(0x\)/ },
      { name: 'Discrete Group', typeHint: /Type:?\s*Discrete Input\s*\(1x\)/ },
      { name: 'Holding Group', typeHint: /Type:?\s*Holding Register\s*\(4x\)/ },
      { name: 'Input Group', typeHint: /Type:?\s*Input Register\s*\(3x\)/ }
    ]

    for (const group of groups) {
      await page.getByText(group.name, { exact: true }).dblclick()
      await expect(page.getByRole('tab', { name: group.name })).toBeVisible()
      await expect(page.getByText(group.typeHint)).toBeVisible()
      await expect(page.getByText(new RegExp(`Slave:?\\s*${MATRIX_SLAVE_ALIAS}`))).toBeVisible()
    }
  })
})
