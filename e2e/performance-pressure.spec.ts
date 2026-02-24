import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  clickNewSlaveAction,
  closeApp,
  createConnectionViaDialog,
  launchMainWindow
} from './helpers/server-e2e'

let app: ElectronApplication
let page: Page

const CONN_ALIAS = 'Perf Connection'
const SLAVE_ALIAS = 'Perf Slave'

const measureMs = async (action: () => Promise<void>): Promise<number> => {
  const start = Date.now()
  await action()
  return Date.now() - start
}

test.beforeAll(async () => {
  const launched = await launchMainWindow()
  app = launched.app
  page = launched.page
})

test.afterAll(async () => {
  await closeApp(app)
})

test.describe.serial('Server Performance Pressure E2E', () => {
  test('keeps paging and interpretation interactions responsive with large register set', async () => {
    await createConnectionViaDialog({
      page,
      alias: CONN_ALIAS,
      mode: 'tcp',
      port: 15420
    })

    await page.getByText(CONN_ALIAS, { exact: true }).click()
    await clickNewSlaveAction(page)
    await expect(page.getByRole('heading', { name: /新建从站|New Slave/ })).toBeVisible()

    await page.getByLabel('Slave Alias').fill(SLAVE_ALIAS)
    await page.getByLabel('Slave ID').fill('8')
    await page.getByLabel('Count').first().fill('1200')
    await page.getByRole('button', { name: /确定|OK/ }).click()

    await expect(page.getByText(`${SLAVE_ALIAS} (ID:8)`)).toBeVisible()
    await page.getByText('Default Group', { exact: true }).dblclick()
    await expect(page.getByRole('tab', { name: /Default Group/ })).toBeVisible()

    const paginationToolbar = page.locator('.MuiTablePagination-toolbar').first()
    const rowsPerPageSelect = paginationToolbar.getByRole('combobox')
    const displayedRows = page.locator('.MuiTablePagination-displayedRows').first()
    const displayedRowsPaginationRoot = displayedRows
      .locator('xpath=ancestor::*[contains(@class,"MuiTablePagination-root")]')
      .first()
    const rowsPerPageDuration = await measureMs(async () => {
      await rowsPerPageSelect.click()
      await page.getByRole('option', { name: '500' }).click()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('listbox')).toBeHidden()
      await expect(page.locator('tbody tr')).toHaveCount(500)
      await expect(displayedRows).toContainText(/1\D+500/)
    })
    expect(rowsPerPageDuration).toBeLessThan(6000)

    const nextPageBtn = displayedRowsPaginationRoot
      .locator('.MuiTablePagination-actions button[title="Go to next page"]')
      .first()
    const pageFlipDuration = await measureMs(async () => {
      await nextPageBtn.evaluate((element) => {
        ;(element as HTMLButtonElement).click()
      })
      await expect(displayedRows).toContainText(/501\D+1000/)
    })
    expect(pageFlipDuration).toBeLessThan(6000)

    const longTab = page.getByRole('tab', { name: 'Long' })
    const doubleTab = page.getByRole('tab', { name: 'Double' })
    const basicTab = page.getByRole('tab', { name: 'Unsigned-Signed-Hex-Binary' })
    const stringTab = page.getByRole('tab', { name: 'String' })

    const tabSwitchDuration = await measureMs(async () => {
      await longTab.click()
      await expect(longTab).toHaveAttribute('aria-selected', 'true')
      await doubleTab.click()
      await expect(doubleTab).toHaveAttribute('aria-selected', 'true')
      await basicTab.click()
      await expect(basicTab).toHaveAttribute('aria-selected', 'true')
      await stringTab.click()
      await expect(stringTab).toHaveAttribute('aria-selected', 'true')
    })
    expect(tabSwitchDuration).toBeLessThan(7000)
  })
})
