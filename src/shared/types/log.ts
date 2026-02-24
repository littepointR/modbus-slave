export type SystemLogLevel = 'debug' | 'info' | 'warn' | 'error'

export type SystemLogSource =
  | 'system'
  | 'comm'
  | 'script'
  | 'connection'
  | 'register'
  | 'workspace'
  | 'cli'

export interface SystemLogEntry {
  id: number
  timestamp: number
  level: SystemLogLevel
  source: SystemLogSource
  module: string
  message: string
  connectionId?: string
  slaveId?: number
  details?: unknown
}

export interface SystemLogStats {
  total: number
  byLevel: Record<SystemLogLevel, number>
  bySource: Record<SystemLogSource, number>
  bufferBytes: number
  bufferLimitBytes: number
}

export interface AppendSystemLogParams {
  level: SystemLogLevel
  source: SystemLogSource
  module: string
  message: string
  connectionId?: string
  slaveId?: number
  details?: unknown
}

