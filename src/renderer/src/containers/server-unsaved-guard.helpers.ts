export const confirmUnsavedWorkspaceChanges = (
  isWorkspaceDirty: boolean,
  confirmFn: () => boolean
): boolean => {
  if (!isWorkspaceDirty) return true
  return confirmFn()
}
