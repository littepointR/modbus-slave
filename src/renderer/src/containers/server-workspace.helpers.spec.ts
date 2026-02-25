import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceTabSettingsSnapshot,
  type OpenTabSnapshot,
  type WorkspaceTabSettingsSnapshot
} from './server-workspace.helpers'

describe('buildWorkspaceTabSettingsSnapshot', () => {
  it('produces stable snapshot before and after tab-settings sync', () => {
    const tabId = 'conn-1-slave-1-group-1'
    const openTabs: OpenTabSnapshot[] = [
      {
        tabId,
        interpretationTab: 'typed',
        stringEncoding: 'utf8',
        typedInterpretation: { 100: 'uint' },
        registerDisplayFormat: { 100: 'hex' }
      }
    ]

    const beforeSync: Record<string, WorkspaceTabSettingsSnapshot> = {}
    const afterSync: Record<string, WorkspaceTabSettingsSnapshot> = {
      [tabId]: {
        interpretationTab: 'typed',
        stringEncoding: 'utf8',
        typedInterpretation: { 100: 'uint' },
        registerDisplayFormat: { 100: 'hex' }
      }
    }

    const beforeSnapshot = buildWorkspaceTabSettingsSnapshot(beforeSync, openTabs)
    const afterSnapshot = buildWorkspaceTabSettingsSnapshot(afterSync, openTabs)

    expect(beforeSnapshot).toEqual(afterSnapshot)
  })
})
