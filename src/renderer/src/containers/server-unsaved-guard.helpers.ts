export const confirmUnsavedWorkspaceChanges = (
  isWorkspaceDirty: boolean,
  confirmFn: () => boolean
): boolean => {
  if (!isWorkspaceDirty) return true
  return confirmFn()
}

export const getWorkspaceDirtyState = (
  workspaceCurrentFingerprint: string,
  workspaceSavedFingerprint: string | null,
  workspaceInitialFingerprint: string | null
): boolean => {
  const baseline = workspaceSavedFingerprint ?? workspaceInitialFingerprint
  if (!baseline) return false
  return workspaceCurrentFingerprint !== baseline
}
