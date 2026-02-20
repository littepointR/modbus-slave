import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { closeApp, launchMainWindow, sendReadHoldingRegisters } from './helpers/server-e2e'

let app: ElectronApplication
let page: Page

const JOURNEY_CONN_ALIAS = 'Journey Connection'
const JOURNEY_SLAVE_ALIAS = 'Journey Slave'
const JOURNEY_PORT = 15320

const ensureChecked = async (row: Locator): Promise<void> => {
  const checkbox = row.locator('td input[type="checkbox"]').first()
  if (!(await checkbox.isChecked())) {
    await checkbox.click()
  }
}

test.beforeAll(async () => {
  const launched = await launchMainWindow()
  app = launched.app
  page = launched.page
})

test.afterAll(async () => {
  await closeApp(app)
})

test('realistic server user journey e2e', async () => {
  await expect(page.getByRole('button', { name: /编辑连接|Edit Connection/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /编辑从站|Edit Slave/ })).toBeVisible()

  await page.getByRole('button', { name: /新建连接|New Connection/ }).click()
  await page.getByLabel('Connection Alias').fill(JOURNEY_CONN_ALIAS)
  await page.getByLabel('IP Address').fill('127.0.0.1')
  await page.getByLabel('Port').fill(String(JOURNEY_PORT))
  await page.getByRole('button', { name: /确定|OK/ }).click()
  await expect(page.getByText(JOURNEY_CONN_ALIAS, { exact: true })).toBeVisible()

  await page.getByText(JOURNEY_CONN_ALIAS, { exact: true }).click()
  await page.getByRole('button', { name: /新建从站|New Slave/ }).click()
  await page.getByLabel('Slave Alias').fill(JOURNEY_SLAVE_ALIAS)
  await page.getByLabel('Slave ID').fill('4')
  await page.getByRole('button', { name: /确定|OK/ }).click()
  await expect(page.getByText(`${JOURNEY_SLAVE_ALIAS} (ID:4)`)).toBeVisible()

  await page.getByText('Default Group', { exact: true }).dblclick()
  await expect(page.getByRole('tab', { name: /Default Group/ })).toBeVisible()

  const valueHeader = page.locator('thead th').filter({ hasText: /^Value$/ }).first()
  const resizeHandle = page.getByTestId('col-resize-value').first()
  const widthBefore = await valueHeader.evaluate((el) => el.getBoundingClientRect().width)
  const handleBox = await resizeHandle.boundingBox()
  if (!handleBox) throw new Error('column resize handle not found')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 80, handleBox.y + handleBox.height / 2)
  await page.mouse.up()
  const widthAfterDrag = await valueHeader.evaluate((el) => el.getBoundingClientRect().width)
  expect(widthAfterDrag).toBeGreaterThan(widthBefore + 30)
  await resizeHandle.dblclick()

  const firstRow = page.locator('tbody tr').nth(0)
  const secondRow = page.locator('tbody tr').nth(1)
  const thirdRow = page.locator('tbody tr').nth(2)
  const fourthRow = page.locator('tbody tr').nth(3)
  await ensureChecked(firstRow)
  await ensureChecked(secondRow)
  await ensureChecked(thirdRow)
  await ensureChecked(fourthRow)

  const typedTab = page.getByRole('tab', { name: 'Typed Decode' })
  await typedTab.click()
  await expect(typedTab).toHaveAttribute('aria-selected', 'true')

  await page.getByTestId('typed-batch-mode').click()
  await page.getByRole('option', { name: /^INT \(2w\)$/ }).click()
  await page.getByTestId('typed-batch-apply').click()
  await expect(page.getByTestId('typed-row-0')).toContainText('INT (2w)')
  await expect(page.getByTestId('typed-row-2')).toContainText('INT (2w)')

  await firstRow.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^DOUBLE \(4w\)$/ }).click()
  await expect(firstRow).toContainText('DOUBLE (4w)')

  await page.getByTestId('value-format-2').click()
  await page.getByRole('menuitem', { name: /^SHORT \(1w\)$/ }).click()
  await expect(thirdRow).toContainText('SHORT (1w)')

  const plotWindowPromise = app.waitForEvent('window')
  await page.getByRole('button', { name: /Plot Selected \(4\)/ }).click()
  const plotPage = await plotWindowPromise
  await plotPage.waitForLoadState('domcontentloaded')
  await expect(plotPage.getByText(/Plot -/)).toBeVisible()
  await expect(plotPage.locator('[role="combobox"]')).toHaveCount(0)
  await expect(plotPage.getByRole('button', { name: 'Pause' })).toBeVisible()
  await plotPage.getByRole('button', { name: 'Pause' }).click()
  await expect(plotPage.getByRole('button', { name: 'Resume' })).toBeVisible()
  await plotPage.getByRole('checkbox', { name: 'Y Auto' }).click()
  await expect(plotPage.getByLabel('Y Min')).toBeEnabled()
  await plotPage.close()

  await page.getByText(JOURNEY_CONN_ALIAS, { exact: true }).click()
  await page.getByRole('button', { name: /打开连接|Open Connection/ }).click()
  await expect(page.getByRole('button', { name: /关闭连接|Close Connection/ })).toBeEnabled()

  const commWindowPromise = app.waitForEvent('window')
  await page.getByRole('button', { name: /通讯详情|Communication Details/ }).click()
  const commPage = await commWindowPromise
  await commPage.waitForLoadState('domcontentloaded')
  await expect(commPage.getByText(/通讯日志|Transaction Log/)).toBeVisible()

  const response = await sendReadHoldingRegisters('127.0.0.1', JOURNEY_PORT, 4, 0, 2)
  expect(response.length).toBeGreaterThan(0)
  await expect(
    commPage.getByText(/RX\s+\|\s+Unit:004\s+\|\s+00 01 00 00 00 06 04 03 00 00 00 02/)
  ).toBeVisible()
})
