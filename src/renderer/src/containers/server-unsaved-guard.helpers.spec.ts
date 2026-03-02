import { describe, expect, it, vi } from 'vitest'
import {
  confirmUnsavedWorkspaceChanges,
  getWorkspaceDirtyState
} from './server-unsaved-guard.helpers'

describe('confirmUnsavedWorkspaceChanges', () => {
  it('allows action immediately when workspace is clean', () => {
    const confirmFn = vi.fn(() => false)

    const result = confirmUnsavedWorkspaceChanges(false, confirmFn)

    expect(result).toBe(true)
    expect(confirmFn).not.toHaveBeenCalled()
  })

  it('asks for confirmation when workspace is dirty', () => {
    const confirmFn = vi.fn(() => true)

    const result = confirmUnsavedWorkspaceChanges(true, confirmFn)

    expect(result).toBe(true)
    expect(confirmFn).toHaveBeenCalledTimes(1)
  })
})

describe('getWorkspaceDirtyState', () => {
  it('detects dirty state for untitled workspace using initial baseline', () => {
    const isDirty = getWorkspaceDirtyState('current-hash', null, 'initial-hash')
    expect(isDirty).toBe(true)
  })

  it('stays clean when no saved or initial baseline exists', () => {
    const isDirty = getWorkspaceDirtyState('current-hash', null, null)
    expect(isDirty).toBe(false)
  })
})
