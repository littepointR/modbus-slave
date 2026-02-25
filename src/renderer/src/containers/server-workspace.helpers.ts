import type { PlotInterpretation } from '@shared'

export interface WorkspaceTabSettingsSnapshot {
  interpretationTab: 'basic' | 'long' | 'float' | 'double' | 'typed' | 'string'
  stringEncoding: string
  typedInterpretation: Record<number, PlotInterpretation>
  registerDisplayFormat: Record<number, 'dec' | 'hex' | 'bin' | 'oct'>
}

export interface OpenTabSnapshot {
  tabId: string
  interpretationTab: WorkspaceTabSettingsSnapshot['interpretationTab']
  stringEncoding: string
  typedInterpretation: WorkspaceTabSettingsSnapshot['typedInterpretation']
  registerDisplayFormat: WorkspaceTabSettingsSnapshot['registerDisplayFormat']
}

export const buildWorkspaceTabSettingsSnapshot = (
  workspaceTabSettings: Record<string, WorkspaceTabSettingsSnapshot>,
  openTabs: OpenTabSnapshot[]
): Record<string, WorkspaceTabSettingsSnapshot> => {
  const next = { ...workspaceTabSettings }

  openTabs.forEach((tab) => {
    next[tab.tabId] = {
      interpretationTab: tab.interpretationTab,
      stringEncoding: tab.stringEncoding,
      typedInterpretation: tab.typedInterpretation,
      registerDisplayFormat: tab.registerDisplayFormat
    }
  })

  return next
}
