import { test, expect, type ElectronApplication, type Page, type Locator } from '@playwright/test'
import {
  clickCloseConnectionAction,
  clickNewConnectionAction,
  clickNewSlaveAction,
  clickOpenConnectionAction,
  closeApp,
  launchMainWindow,
  sendReadHoldingRegisters
} from './helpers/server-e2e'

let app: ElectronApplication
let page: Page

const CONN_ALIAS = 'QA Connection'
const CONN_ALIAS_EDITED = 'QA Connection Edited'
const SLAVE_ALIAS = 'QA Slave'
const CONN_PORT = 15020

test.beforeAll(async () => {
  const launched = await launchMainWindow()
  app = launched.app
  page = launched.page
})

test.afterAll(async () => {
  await closeApp(app)
})

test.describe.serial('Server Smoke And Comm E2E', () => {
  test('app launches and shows server toolbar', async () => {
    expect(await page.title()).toBe('Modbus Slave Emulator')
    await expect(page.getByRole('button', { name: /连接|Connection/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /工作空间|Workspace/ })).toBeVisible()
    await expect(page.getByText('Connections', { exact: true })).toBeVisible()
  })

  test('can switch theme mode and theme color from settings', async () => {
    await page.getByTestId('settings-btn').click()

    const settingsPaper = page.locator('.MuiPopover-paper')
    const themeModeCombobox = settingsPaper.locator('[role="combobox"]').nth(1)
    await themeModeCombobox.click()
    await page.getByRole('option', { name: /Light|亮色/ }).click()
    await expect(
      page.evaluate(() => localStorage.getItem('modbus-slave.theme.mode'))
    ).resolves.toBe('light')

    const colorPickerToggle = page.getByLabel('toggle-theme-color-picker')
    if ((await colorPickerToggle.count()) > 0) {
      await colorPickerToggle.click()
    }
    await page.getByLabel(/Blue|蓝色/).click()
    await expect(
      page.evaluate(() => localStorage.getItem('modbus-slave.theme.color'))
    ).resolves.toBe('blue')

    await themeModeCombobox.click()
    await page.getByRole('option', { name: /Auto|自动/ }).click()
    await expect(
      page.evaluate(() => localStorage.getItem('modbus-slave.theme.mode'))
    ).resolves.toBe('system')

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('settings-btn')).toBeVisible()
  })

  test('can create a TCP connection', async () => {
    await clickNewConnectionAction(page)
    await expect(page.getByRole('heading', { name: /新建连接|New Connection/ })).toBeVisible()

    await page.getByLabel('Connection Alias').fill(CONN_ALIAS)
    await page.getByLabel('IP Address').fill('127.0.0.1')
    await page.getByLabel('Port').fill(String(CONN_PORT))

    await page.getByRole('button', { name: /确定|OK/ }).click()
    await expect(page.getByText(CONN_ALIAS, { exact: true })).toBeVisible()
  })

  test('can open, close and edit connection', async () => {
    await page.getByText(CONN_ALIAS, { exact: true }).click()

    await clickOpenConnectionAction(page)
    await clickCloseConnectionAction(page)

    await page.getByRole('button', { name: /工具|Tools/ }).click()
    await page.getByRole('menuitem', { name: /编辑连接|Edit Connection/ }).click()
    await expect(page.getByRole('heading', { name: /编辑连接|Edit Connection/ })).toBeVisible()

    await page.getByLabel('Connection Alias').fill(CONN_ALIAS_EDITED)
    await page.getByRole('button', { name: /保存|Save/ }).click()

    await expect(page.getByText(CONN_ALIAS_EDITED, { exact: true })).toBeVisible()
  })

  test('can add a slave and open default register group tab', async () => {
    await page.getByText(CONN_ALIAS_EDITED, { exact: true }).click()
    await clickNewSlaveAction(page)

    await expect(page.getByRole('heading', { name: /新建从站|New Slave/ })).toBeVisible()
    await page.getByLabel('Slave Alias').fill(SLAVE_ALIAS)
    await page.getByLabel('Slave ID').fill('2')
    await page.getByRole('button', { name: /确定|OK/ }).click()

    await expect(page.getByText(`${SLAVE_ALIAS} (ID:2)`)).toBeVisible()
    await page.getByText('Default Group', { exact: true }).dblclick()

    await expect(page.getByRole('tab', { name: /Default Group/ })).toBeVisible()
    await expect(page.getByText(/Type:?\s*Holding Register \(4x\)/)).toBeVisible()
    await expect(page.getByText(new RegExp(`Conn(?:ection)?:?\\s*${CONN_ALIAS_EDITED}`))).toBeVisible()
    await expect(page.getByText(new RegExp(`Slave:?\\s*${SLAVE_ALIAS}`))).toBeVisible()
  })

  test('can select register and switch interpretation tabs', async () => {
    await page.getByText(CONN_ALIAS_EDITED, { exact: true }).click()
    await page.locator('p.MuiTypography-root', { hasText: 'Default Group' }).first().dblclick()
    await expect(page.getByRole('tab', { name: /Default Group/ })).toBeVisible()
    await page.getByRole('tab', { name: /Default Group/ }).click()

    await page.locator('tbody tr').first().click()
    await expect(page.getByTestId('value-cell-0')).toBeVisible()
    await page.keyboard.press('Escape')
    const interpretationTablist = page.locator('[role="tablist"]').nth(1)
    await expect(interpretationTablist).toBeVisible()

    const longTab = interpretationTablist.locator('[role="tab"]').nth(1)
    await longTab.evaluate((element) => {
      ;(element as HTMLButtonElement).click()
    })
    await expect(longTab).toHaveAttribute('aria-selected', 'true')

    const floatTab = interpretationTablist.locator('[role="tab"]').nth(2)
    await floatTab.evaluate((element) => {
      ;(element as HTMLButtonElement).click()
    })
    await expect(floatTab).toHaveAttribute('aria-selected', 'true')

    const stringTab = interpretationTablist.locator('[role="tab"]').nth(4)
    await stringTab.evaluate((element) => {
      ;(element as HTMLButtonElement).click()
    })
    await expect(stringTab).toHaveAttribute('aria-selected', 'true')
  })

  test('type interpretation supports constrained options and batch apply', async () => {
    const ensureChecked = async (rowIndex: number) => {
      const checkbox = page.locator('tbody tr').nth(rowIndex).locator('td input[type="checkbox"]').first()
      if (!(await checkbox.isChecked())) {
        await checkbox.click()
      }
    }

    await ensureChecked(0)
    await ensureChecked(1)
    await ensureChecked(2)
    await ensureChecked(3)

    const selectionPanel = page.getByRole('heading', { name: 'Set Display For Selection' }).locator('..')
    const batchMode = selectionPanel.locator('[role="combobox"]').first()
    await batchMode.click()
    await page.getByRole('option', { name: /^INT \(2w\)$/ }).click()
    await page.getByTestId('typed-batch-apply').click()

    await expect(page.getByTestId('value-format-0')).toContainText('INT (2w)')
    await expect(page.getByTestId('value-format-2')).toContainText('INT (2w)')
    await expect(page.getByTestId('value-format-1')).toContainText('INT (2w)')

    const firstRow = page.locator('tbody tr').nth(0)
    await firstRow.click({ button: 'right' })
    await page.getByRole('menuitem', { name: /^DOUBLE \(4w\)$/ }).click()
    await expect(firstRow).toContainText('DOUBLE (4w)')

    await page.getByTestId('value-format-2').click()
    const shortMenuItem = page.getByRole('menuitem', { name: /^SHORT \(1w\)$/ })
    await expect(shortMenuItem).toBeVisible()
    await expect(shortMenuItem).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')
  })

  test('can open plot window with fixed interpretation and reflect table highlighting', async () => {
    const firstRow = page.locator('tbody tr').nth(0)
    const secondRow = page.locator('tbody tr').nth(1)
    const thirdRow = page.locator('tbody tr').nth(2)
    const fourthRow = page.locator('tbody tr').nth(3)

    const ensureChecked = async (row: Locator) => {
      const checkbox = row.locator('td input[type="checkbox"]').first()
      if (!(await checkbox.isChecked())) {
        await checkbox.click()
      }
    }
    const ensureUnchecked = async (row: Locator) => {
      const checkbox = row.locator('td input[type="checkbox"]').first()
      if (await checkbox.isChecked()) {
        await checkbox.click()
      }
    }

    await ensureChecked(firstRow)
    await ensureChecked(secondRow)
    await ensureUnchecked(thirdRow)
    await ensureUnchecked(fourthRow)

    const getValueCellBackground = async (row: Locator, address: number): Promise<string | null> =>
      await row.evaluate((el, targetAddress) => {
        const cell = el.querySelector(`[data-testid="value-cell-${targetAddress}"]`) as HTMLElement | null
        if (!cell) return null
        return getComputedStyle(cell).backgroundColor
      }, address)

    const bg1 = await getValueCellBackground(firstRow, 0)
    const bg2 = await getValueCellBackground(secondRow, 1)
    const bg3 = await getValueCellBackground(thirdRow, 2)
    await expect(page.getByTestId('value-cell-0')).toBeVisible()

    expect(bg1).not.toBeNull()
    expect(bg2).not.toBeNull()
    expect(bg3).not.toBeNull()
    expect(bg1).not.toBe(bg2)
    expect(bg1).not.toBe('rgba(0, 0, 0, 0)')
    expect(bg2).not.toBe('rgba(0, 0, 0, 0)')
    expect(bg3).not.toBe('rgba(0, 0, 0, 0)')

    await page.getByRole('button', { name: /Plot\s*\(2\)/ }).click()
    let plotPage: Page | null = null
    await expect
      .poll(async () => {
        const windows = app.windows()
        for (const win of windows) {
          if (win === page || win.isClosed()) continue
          try {
            const title = await win.title()
            if (/^Plot - /.test(title)) {
              plotPage = win
              return true
            }
          } catch {
            // window may close while polling, keep trying.
          }
        }
        return false
      })
      .toBe(true)
    expect(plotPage).not.toBeNull()
    await plotPage!.waitForLoadState('domcontentloaded')

    await expect(plotPage!.getByText(/Plot -/)).toBeVisible()
    await expect(plotPage!.getByText(/0x0000/i)).toBeVisible()
    await expect(plotPage!.getByText(/0x0001/i)).toBeVisible()
    await expect(plotPage!.locator('[role="combobox"]')).toHaveCount(0)
    await expect(plotPage!.getByText(/\([124]w\)/)).toHaveCount(2)
    await expect(plotPage!.getByRole('checkbox', { name: /X Auto|X 轴自适应/ })).toBeChecked()
    await expect(plotPage!.getByRole('checkbox', { name: /Y Auto|Y 轴自适应/ })).toBeChecked()
    await expect(plotPage!.getByLabel(/Y Min|Y 最小值/)).toBeDisabled()
    await expect(plotPage!.getByRole('button', { name: /Stop|停止/ })).toBeVisible()
    await plotPage!.getByRole('button', { name: /Stop|停止/ }).click()
    await expect(plotPage!.getByRole('button', { name: /Continue|继续/ })).toBeVisible()
    await plotPage!.getByRole('checkbox', { name: /Y Auto|Y 轴自适应/ }).click()
    await expect(plotPage!.getByLabel(/Y Min|Y 最小值/)).toBeEnabled()

    await plotPage!.close()
    await expect.poll(async () => app.windows().length).toBe(1)
  })

  test('can open communication log window', async () => {
    const newConnectionBtn = page.getByRole('button', { name: /连接|Connection/ })
    const hasToolbar = (await newConnectionBtn.count()) > 0 && (await newConnectionBtn.first().isVisible())
    if (!hasToolbar) {
      await closeApp(app)
      const relaunched = await launchMainWindow()
      app = relaunched.app
      page = relaunched.page
    }

    const editedConnection = page.getByText(CONN_ALIAS_EDITED, { exact: true })
    if ((await editedConnection.count()) === 0) {
      await clickNewConnectionAction(page)
      await page.getByLabel('Connection Alias').fill(CONN_ALIAS_EDITED)
      await page.getByLabel('IP Address').fill('127.0.0.1')
      await page.getByLabel('Port').fill(String(CONN_PORT))
      await page.getByRole('button', { name: /确定|OK/ }).click()
    }

    await page.getByText(CONN_ALIAS_EDITED, { exact: true }).click()
    await clickOpenConnectionAction(page)

    await page.getByRole('button', { name: /工具|Tools/ }).click()
    await page.getByRole('menuitem', { name: /通讯详情|Communication Details/ }).click()

    await expect.poll(async () => app.windows().length).toBeGreaterThan(1)

    const windows = app.windows()
    const commPage = windows[windows.length - 1]
    await commPage.waitForLoadState('domcontentloaded')

    await expect(commPage.getByText(/通讯详情|Communication Details/)).toBeVisible()
    await expect(commPage.getByRole('button', { name: /继续|Continue/ })).toBeVisible()
    await expect(commPage.getByRole('button', { name: /停止|Stop/ })).toBeVisible()
    await expect(commPage.getByRole('button', { name: /清空|Clear/ })).toBeVisible()
    const saveButton = commPage.getByRole('button', { name: /保存|Save/ })
    await expect(saveButton).toBeVisible()

    const response = await sendReadHoldingRegisters('127.0.0.1', CONN_PORT, 2, 0, 2)
    expect(response.length).toBeGreaterThan(0)

    await expect(
      commPage.getByText(/RX\s+\|\s+Unit:002\s+\|\s+00 01 00 00 00 06 02 03 00 00 00 02/)
    ).toBeVisible()
    await expect(saveButton).toBeEnabled()
  })
})
