import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type {
  Connection,
  OpenTab,
  PersistedWorkspaceSnapshot,
  RecentWorkspaceEntry,
  ScriptDefinition,
  WorkspaceFileHandle,
  WorkspaceTabSettings
} from '@shared'
import { PersistedWorkspaceSnapshotSchema } from '@shared'
import { buildWorkspaceTabSettingsSnapshot } from '../server-workspace.helpers'
import { getWorkspaceDirtyState } from '../server-unsaved-guard.helpers'

interface UseWorkspaceManagementProps {
  connections: Connection[]
  setConnections: (connections: Connection[]) => void
  scriptsByConnection: Record<string, ScriptDefinition[]>
  setScriptsByConnection: (scripts: Record<string, ScriptDefinition[]>) => void
  openTabs: OpenTab[]
  setOpenTabs: (tabs: OpenTab[]) => void
  activeTabId: string | null
  setActiveTabId: (id: string | null) => void
  globalEncoding: string
  showUserError: (message: string) => void
  getTabId: (connectionId: string, slaveId: string, groupId: string) => string
}

interface UseWorkspaceManagementReturn {
  workspaceTabSettings: Record<string, WorkspaceTabSettings>
  setWorkspaceTabSettings: React.Dispatch<
    React.SetStateAction<Record<string, WorkspaceTabSettings>>
  >
  workspaceFileHandle: WorkspaceFileHandle | null
  setWorkspaceFileHandle: React.Dispatch<React.SetStateAction<WorkspaceFileHandle | null>>
  workspaceFilename: string | null
  setWorkspaceFilename: React.Dispatch<React.SetStateAction<string | null>>
  workspaceFilePath: string | null
  setWorkspaceFilePath: React.Dispatch<React.SetStateAction<string | null>>
  workspaceSavedFingerprint: string | null
  setWorkspaceSavedFingerprint: React.Dispatch<React.SetStateAction<string | null>>
  recentWorkspaces: RecentWorkspaceEntry[]
  setRecentWorkspaces: React.Dispatch<React.SetStateAction<RecentWorkspaceEntry[]>>
  isWorkspaceDirty: boolean
  workspaceCurrentFingerprint: string
  workspaceInitialFingerprint: string | null
  getWorkspaceSnapshot: () => PersistedWorkspaceSnapshot
  serializeWorkspaceSnapshot: (workspace: PersistedWorkspaceSnapshot) => string
  applyWorkspaceSnapshot: (
    workspace: PersistedWorkspaceSnapshot,
    options?: { fileName?: string; filePath?: string | null }
  ) => string | null
  openWorkspaceByPath: (
    path: string,
    options?: { fallbackName?: string; removeOnError?: boolean; setAsLast?: boolean }
  ) => Promise<boolean>
  upsertRecentWorkspaceByPath: (
    path: string,
    name: string,
    options?: { setAsLast?: boolean }
  ) => void
  removeRecentWorkspace: (entryId: string) => void
  removeRecentWorkspaceByPath: (path: string) => void
  loadRecentWorkspacesFromStorage: () => RecentWorkspaceEntry[]
  markLastWorkspaceId: (id: string | null) => void
  DEFAULT_WORKSPACE_FILENAME_PREFIX: string
  LAST_WORKSPACE_ID_STORAGE_KEY: string
}

export const useWorkspaceManagement = ({
  connections,
  setConnections,
  scriptsByConnection,
  setScriptsByConnection,
  openTabs,
  setOpenTabs,
  activeTabId,
  setActiveTabId,
  globalEncoding,
  showUserError,
  getTabId
}: UseWorkspaceManagementProps): UseWorkspaceManagementReturn => {
  const [workspaceTabSettings, setWorkspaceTabSettings] = useState<
    Record<string, WorkspaceTabSettings>
  >({})
  const [workspaceFileHandle, setWorkspaceFileHandle] = useState<WorkspaceFileHandle | null>(null)
  const [workspaceFilename, setWorkspaceFilename] = useState<string | null>(null)
  const [workspaceFilePath, setWorkspaceFilePath] = useState<string | null>(null)
  const [workspaceSavedFingerprint, setWorkspaceSavedFingerprint] = useState<string | null>(null)
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspaceEntry[]>([])

  const workspaceInitialFingerprintRef = useRef<string | null>(null)

  const RECENT_WORKSPACES_STORAGE_KEY = 'modbus-slave.server.recentWorkspaces.v1'
  const LAST_WORKSPACE_ID_STORAGE_KEY = 'modbus-slave.server.lastWorkspaceId.v1'
  const MAX_RECENT_WORKSPACES = 8
  const DEFAULT_WORKSPACE_FILENAME_PREFIX = 'modbus-slave_workspace'

  const getWorkspaceSnapshot = useCallback((): PersistedWorkspaceSnapshot => {
    const tabSettingsSnapshot = buildWorkspaceTabSettingsSnapshot(
      workspaceTabSettings,
      openTabs.map((tab) => ({
        tabId: getTabId(tab.connectionId, tab.slaveId, tab.registerGroupId),
        interpretationTab: tab.interpretationTab,
        stringEncoding: tab.stringEncoding,
        typedInterpretation: tab.typedInterpretation,
        registerDisplayFormat: tab.registerDisplayFormat
      }))
    )

    return {
      version: 4,
      connections,
      tabSettings: tabSettingsSnapshot,
      scriptsByConnection,
      openTabs: openTabs.map((tab) => ({
        connectionId: tab.connectionId,
        slaveId: tab.slaveId,
        registerGroupId: tab.registerGroupId
      })),
      activeTabId
    }
  }, [connections, workspaceTabSettings, scriptsByConnection, openTabs, activeTabId, getTabId])

  const serializeWorkspaceSnapshot = useCallback(
    (workspace: PersistedWorkspaceSnapshot): string => JSON.stringify(workspace),
    []
  )

  const workspaceCurrentFingerprint = useMemo(
    (): string => serializeWorkspaceSnapshot(getWorkspaceSnapshot()),
    [serializeWorkspaceSnapshot, getWorkspaceSnapshot]
  )

  const isWorkspaceDirty = getWorkspaceDirtyState(
    workspaceCurrentFingerprint,
    workspaceSavedFingerprint,
    workspaceInitialFingerprintRef.current
  )

  const loadRecentWorkspacesFromStorage = useCallback((): RecentWorkspaceEntry[] => {
    try {
      const raw = localStorage.getItem(RECENT_WORKSPACES_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((item) => item && typeof item === 'object') as RecentWorkspaceEntry[]
    } catch {
      return []
    }
  }, [])

  const markLastWorkspaceId = useCallback((id: string | null): void => {
    if (!id) {
      localStorage.removeItem(LAST_WORKSPACE_ID_STORAGE_KEY)
      return
    }
    localStorage.setItem(LAST_WORKSPACE_ID_STORAGE_KEY, id)
  }, [])

  const upsertRecentWorkspaceByPath = useCallback(
    (path: string, name: string, options?: { setAsLast?: boolean }): void => {
      setRecentWorkspaces((prev) => {
        const existing = prev.find((entry) => entry.path === path)
        const nextEntry: RecentWorkspaceEntry = existing
          ? { ...existing, name, updatedAt: Date.now() }
          : { id: uuidv4(), name, path, updatedAt: Date.now() }

        const merged = [nextEntry, ...prev.filter((entry) => entry.path !== path)].slice(
          0,
          MAX_RECENT_WORKSPACES
        )

        // We need to persist inside the state setter to ensure we have the latest 'prev'
        localStorage.setItem(RECENT_WORKSPACES_STORAGE_KEY, JSON.stringify(merged))
        if (options?.setAsLast !== false) {
          markLastWorkspaceId(nextEntry.id)
        }
        return merged
      })
    },
    [markLastWorkspaceId]
  )

  const removeRecentWorkspace = useCallback(
    (entryId: string): void => {
      setRecentWorkspaces((prev) => {
        const next = prev.filter((entry) => entry.id !== entryId)
        localStorage.setItem(RECENT_WORKSPACES_STORAGE_KEY, JSON.stringify(next))
        const lastId = localStorage.getItem(LAST_WORKSPACE_ID_STORAGE_KEY)
        if (lastId === entryId) {
          markLastWorkspaceId(null)
        }
        return next
      })
    },
    [markLastWorkspaceId]
  )

  const removeRecentWorkspaceByPath = useCallback(
    (path: string): void => {
      setRecentWorkspaces((prev) => {
        const target = prev.find((entry) => entry.path === path)
        if (!target) return prev
        const next = prev.filter((entry) => entry.path !== path)
        localStorage.setItem(RECENT_WORKSPACES_STORAGE_KEY, JSON.stringify(next))
        const lastId = localStorage.getItem(LAST_WORKSPACE_ID_STORAGE_KEY)
        if (lastId === target.id) {
          markLastWorkspaceId(null)
        }
        return next
      })
    },
    [markLastWorkspaceId]
  )

  const applyWorkspaceSnapshot = useCallback(
    (
      workspace: PersistedWorkspaceSnapshot,
      options?: { fileName?: string; filePath?: string | null }
    ): string | null => {
      const workspaceVersion = workspace.version
      try {
        if (
          (workspaceVersion === 1 ||
            workspaceVersion === 2 ||
            workspaceVersion === 3 ||
            workspaceVersion === 4) &&
          Array.isArray(workspace.connections)
        ) {
          const restoredTabSettings =
            (workspaceVersion === 2 || workspaceVersion === 3 || workspaceVersion === 4) &&
            workspace.tabSettings &&
            typeof workspace.tabSettings === 'object'
              ? workspace.tabSettings
              : {}

          const restoredOpenTabs =
            workspaceVersion === 4 && Array.isArray(workspace.openTabs)
              ? workspace.openTabs
                  .map((savedTab) => {
                    const connection = workspace.connections.find(
                      (conn) => conn.id === savedTab.connectionId
                    )
                    const slave = connection?.slaves.find((item) => item.id === savedTab.slaveId)
                    const group = slave?.registerGroups.find(
                      (item) => item.id === savedTab.registerGroupId
                    )
                    if (!connection || !slave || !group) return null
                    const tabId = getTabId(
                      savedTab.connectionId,
                      savedTab.slaveId,
                      savedTab.registerGroupId
                    )
                    const savedSettings = restoredTabSettings[tabId]
                    return {
                      connectionId: savedTab.connectionId,
                      slaveId: savedTab.slaveId,
                      registerGroupId: savedTab.registerGroupId,
                      selectedAddresses: new Set<number>(),
                      interpretationTab: savedSettings?.interpretationTab || 'basic',
                      stringEncoding: savedSettings?.stringEncoding || globalEncoding,
                      typedInterpretation: savedSettings?.typedInterpretation || {},
                      registerDisplayFormat: savedSettings?.registerDisplayFormat || {}
                    } as OpenTab
                  })
                  .filter((tab): tab is OpenTab => tab !== null)
              : []

          const normalizedConnections = workspace.connections.map((connection) => ({
            ...connection,
            isOpen: false
          }))
          const normalizedTabSettings = buildWorkspaceTabSettingsSnapshot(
            restoredTabSettings,
            restoredOpenTabs.map((tab) => ({
              tabId: getTabId(tab.connectionId, tab.slaveId, tab.registerGroupId),
              interpretationTab: tab.interpretationTab,
              stringEncoding: tab.stringEncoding,
              typedInterpretation: tab.typedInterpretation,
              registerDisplayFormat: tab.registerDisplayFormat
            }))
          )

          const restoredScripts =
            (workspaceVersion === 3 || workspaceVersion === 4) &&
            workspace.scriptsByConnection &&
            typeof workspace.scriptsByConnection === 'object'
              ? workspace.scriptsByConnection
              : {}

          const preferredActiveTabId =
            workspaceVersion === 4 && typeof workspace.activeTabId === 'string'
              ? workspace.activeTabId
              : null
          const hasPreferredTab =
            preferredActiveTabId &&
            restoredOpenTabs.some(
              (tab) => getTabId(tab.connectionId, tab.slaveId, tab.registerGroupId) === preferredActiveTabId
            )
          const nextActiveTabId =
            hasPreferredTab
              ? preferredActiveTabId
              : restoredOpenTabs[0]
                ? getTabId(
                    restoredOpenTabs[0].connectionId,
                    restoredOpenTabs[0].slaveId,
                    restoredOpenTabs[0].registerGroupId
                  )
                : null

          setConnections(normalizedConnections)
          setScriptsByConnection(restoredScripts)
          setOpenTabs(restoredOpenTabs)
          setActiveTabId(nextActiveTabId)
          setWorkspaceTabSettings(normalizedTabSettings)

          setWorkspaceFileHandle(null)
          setWorkspaceFilename(options?.fileName || null)
          setWorkspaceFilePath(options?.filePath || null)

          const fingerprint = serializeWorkspaceSnapshot({
            version: 4,
            connections: normalizedConnections,
            tabSettings: normalizedTabSettings,
            scriptsByConnection: restoredScripts,
            openTabs: restoredOpenTabs.map((tab) => ({
              connectionId: tab.connectionId,
              slaveId: tab.slaveId,
              registerGroupId: tab.registerGroupId
            })),
            activeTabId: nextActiveTabId
          })
          workspaceInitialFingerprintRef.current = fingerprint
          return fingerprint
        }
      } catch (err) {
        console.error('CRASH in applyWorkspaceSnapshot:', err)
      }
      showUserError('Invalid workspace file format.')
      return null
    },
    [
      setConnections,
      setScriptsByConnection,
      setOpenTabs,
      setActiveTabId,
      globalEncoding,
      showUserError,
      getTabId,
      serializeWorkspaceSnapshot
    ]
  )

  const openWorkspaceByPath = useCallback(
    async (
      path: string,
      options?: { fallbackName?: string; removeOnError?: boolean; setAsLast?: boolean }
    ): Promise<boolean> => {
      try {
        const text = await window.api.readTextFile(path)
        const raw = JSON.parse(text)
        const validation = PersistedWorkspaceSnapshotSchema.safeParse(raw)

        if (!validation.success) {
          console.error('Workspace validation failed:', validation.error)
          showUserError(`Invalid workspace data in file: ${validation.error.message}`)
          return false
        }

        const workspace = validation.data
        const fileName = path.split(/[\\/]/).pop() || options?.fallbackName
        const applied = applyWorkspaceSnapshot(workspace, { fileName, filePath: path })
        if (!applied) return false
        setWorkspaceSavedFingerprint(applied)

        void window.api.appendSystemLog({
          level: 'info',
          source: 'workspace',
          module: 'server.ui',
          message: `Workspace loaded: ${fileName}`,
          details: { path }
        })

        upsertRecentWorkspaceByPath(path, fileName || options?.fallbackName || path, {
          setAsLast: options?.setAsLast
        })
        return true
      } catch (error) {
        console.warn('Failed to load workspace from path:', path, error)
        if (options?.removeOnError) {
          removeRecentWorkspaceByPath(path)
        }
        return false
      }
    },
    [applyWorkspaceSnapshot, upsertRecentWorkspaceByPath, removeRecentWorkspaceByPath, showUserError]
  )

  useEffect(() => {
    if (workspaceInitialFingerprintRef.current === null) {
      workspaceInitialFingerprintRef.current = workspaceCurrentFingerprint
    }
  }, [workspaceCurrentFingerprint])

  return {
    workspaceTabSettings,
    setWorkspaceTabSettings,
    workspaceFileHandle,
    setWorkspaceFileHandle,
    workspaceFilename,
    setWorkspaceFilename,
    workspaceFilePath,
    setWorkspaceFilePath,
    workspaceSavedFingerprint,
    setWorkspaceSavedFingerprint,
    recentWorkspaces,
    setRecentWorkspaces,
    isWorkspaceDirty,
    workspaceCurrentFingerprint,
    workspaceInitialFingerprint: workspaceInitialFingerprintRef.current,
    getWorkspaceSnapshot,
    serializeWorkspaceSnapshot,
    applyWorkspaceSnapshot,
    openWorkspaceByPath,
    upsertRecentWorkspaceByPath,
    removeRecentWorkspace,
    removeRecentWorkspaceByPath,
    loadRecentWorkspacesFromStorage,
    markLastWorkspaceId,
    DEFAULT_WORKSPACE_FILENAME_PREFIX,
    LAST_WORKSPACE_ID_STORAGE_KEY
  }
}
