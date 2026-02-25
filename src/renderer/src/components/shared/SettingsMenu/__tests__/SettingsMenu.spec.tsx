// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import SettingsMenu from '../SettingsMenu'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      language: 'en',
      changeLanguage: vi.fn()
    },
    t: (key: string) => {
      const dict: Record<string, string> = {
        'common.settings': 'Settings',
        'common.version': 'Version',
        'common.theme': 'Theme',
        'common.themeMode': 'Appearance',
        'common.themeModeLight': 'Light',
        'common.themeModeDark': 'Dark',
        'common.themeModeSystem': 'Auto (System)',
        'common.themeColor': 'Theme Color',
        'common.themeColorGreen': 'Green',
        'common.themeColorBlue': 'Blue',
        'common.themeColorOrange': 'Orange',
        'common.themeColorRose': 'Rose',
        'common.globalFont': 'Global Font',
        'common.globalFontSize': 'Global Font Size',
        'common.globalEncoding': 'Global Encoding',
        'common.commBufferSize': 'Communication Buffer Size (MB)',
        'common.systemLogBufferSize': 'System Log Buffer Size (MB)'
      }
      return dict[key] ?? key
    }
  })
}))

vi.mock('@renderer/theme/theme-settings', () => ({
  useThemeSettings: () => ({
    themeMode: 'light',
    themeColor: 'green',
    setThemeMode: vi.fn(),
    setThemeColor: vi.fn()
  })
}))

vi.mock('@renderer/context/root.zustand', () => ({
  useRootZustand: (selector: (state: { version: string }) => string) => selector({ version: '2.1.0' })
}))

describe('SettingsMenu', () => {
  it('shows current app version in settings popover', async () => {
    const user = userEvent.setup()
    render(<SettingsMenu />)

    await user.click(screen.getByTestId('settings-btn'))

    expect(screen.getByTestId('settings-version')).toHaveTextContent('Version 2.1.0')
  })
})
