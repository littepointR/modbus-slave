import { v4 as uuidv4 } from 'uuid'
import { ModbusServer } from './mobusServer'
import { CreateServerParams, RegisterParams, ServerConnectionConfig, UnitIdString } from '@shared'
import type { SystemLogger } from './systemLogger'

type RegisterTypeCode = '01' | '02' | '03' | '04'

interface RegisterEntry {
  address: number
  value: number
  variableName: string
  comment: string
}

interface RegisterGroupEntry {
  id: string
  name: string
  type: RegisterTypeCode
  startAddress: number
  count: number
  registers: RegisterEntry[]
}

interface SlaveEntry {
  id: string
  alias: string
  slaveId: number
  responseDelay: number
  initMode: 'none' | 'random' | 'address'
  addressType: 'protocol' | 'plc'
  registerGroups: RegisterGroupEntry[]
}

interface ConnectionEntry {
  id: string
  alias: string
  mode: 'rtu' | 'tcp' | 'udp' | 'rtuovertcp' | 'rtuoverudp'
  invalidRequestBehavior?: 'silent' | 'exception'
  serialPort?: string
  baudRate?: number
  dataBits?: number
  parity?: 'none' | 'even' | 'odd'
  stopBits?: number
  flowControl?: 'none' | 'rtscts' | 'xonxoff'
  frameFormat?: 'rtu' | 'ascii'
  ipAddress?: string
  port?: number
  isOpen: boolean
  slaves: SlaveEntry[]
}

interface ScriptDefinition {
  id: string
  name: string
  enabled: boolean
  intervalMs: number
  code: string
  lastError?: string
  lastRunAt?: number
}

interface WorkspaceState {
  version: number
  connections: ConnectionEntry[]
  scriptsByConnection: Record<string, ScriptDefinition[]>
}

interface UiActionPayload {
  [key: string]: unknown
}

interface CliScriptApi {
  getValue: (unitId: number, registerType: RegisterTypeCode, address: number) => number | undefined
  setValue: (
    unitId: number,
    registerType: RegisterTypeCode,
    address: number,
    value: number
  ) => Promise<boolean>
  setValues: (
    unitId: number,
    registerType: RegisterTypeCode,
    values: Record<number, number>
  ) => Promise<number>
  log: (...args: unknown[]) => void
}

const clampWord = (value: number): number => Math.max(0, Math.min(65535, Math.round(value)))

const toUnitIdString = (unitId: number): UnitIdString => String(unitId) as UnitIdString

const getBoolType = (type: RegisterTypeCode): 'coils' | 'discrete_inputs' | undefined => {
  if (type === '01') return 'coils'
  if (type === '02') return 'discrete_inputs'
  return undefined
}

const getNumberType = (
  type: RegisterTypeCode
): 'holding_registers' | 'input_registers' | undefined => {
  if (type === '03') return 'holding_registers'
  if (type === '04') return 'input_registers'
  return undefined
}

const toServerConfig = (connection: ConnectionEntry): ServerConnectionConfig => {
  const invalidRequestBehavior = connection.invalidRequestBehavior ?? 'silent'
  switch (connection.mode) {
    case 'tcp':
      return {
        protocol: 'ModbusTcp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502,
        invalidRequestBehavior
      }
    case 'udp':
      return {
        protocol: 'ModbusUdp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502,
        invalidRequestBehavior
      }
    case 'rtuovertcp':
      return {
        protocol: 'ModbusRtuOverTcp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502,
        invalidRequestBehavior
      }
    case 'rtuoverudp':
      return {
        protocol: 'ModbusRtuOverUdp',
        host: connection.ipAddress || '127.0.0.1',
        port: connection.port || 502,
        invalidRequestBehavior
      }
    case 'rtu':
    default:
      return {
        protocol: connection.frameFormat === 'ascii' ? 'ModbusAscii' : 'ModbusRtu',
        invalidRequestBehavior,
        serial: {
          port: connection.serialPort || '',
          baudRate: connection.baudRate || 9600,
          dataBits: connection.dataBits || 8,
          stopBits: connection.stopBits || 1,
          parity: connection.parity || 'none'
        }
      }
  }
}

const toStaticRegisterParams = (
  register: RegisterEntry,
  registerType: 'holding_registers' | 'input_registers'
): RegisterParams => ({
  address: register.address,
  registerType,
  dataType: 'uint16',
  comment: register.comment || '',
  value: clampWord(register.value),
  min: undefined,
  max: undefined,
  interval: undefined
})

export class CliWorkspaceRuntime {
  private state: WorkspaceState = {
    version: 3,
    connections: [],
    scriptsByConnection: {}
  }
  private readonly server: ModbusServer
  private readonly logger?: SystemLogger
  private scriptScopeMap = new Map<string, Record<string, unknown>>()

  constructor(server: ModbusServer, logger?: SystemLogger) {
    this.server = server
    this.logger = logger
  }

  getState(): WorkspaceState {
    return JSON.parse(JSON.stringify(this.state)) as WorkspaceState
  }

  async dispatch(action: string, payload: UiActionPayload = {}): Promise<unknown> {
    this.logger?.log({
      level: 'debug',
      source: 'cli',
      module: 'cliWorkspace',
      message: `Dispatch action: ${action}`,
      details: payload
    })
    switch (action) {
      case 'workspace.get':
        return this.getState()
      case 'workspace.replace':
        return await this.replaceWorkspace(payload)
      case 'connection.create':
        return this.createConnection(payload)
      case 'connection.update':
        return this.updateConnection(payload)
      case 'connection.delete':
        return await this.deleteConnection(payload)
      case 'connection.open':
        return await this.openConnection(payload)
      case 'connection.close':
        return await this.closeConnection(payload)
      case 'slave.create':
        return this.createSlave(payload)
      case 'slave.update':
        return this.updateSlave(payload)
      case 'slave.delete':
        return this.deleteSlave(payload)
      case 'register.set':
        return await this.setRegisterValue(payload)
      case 'register.batch_set':
        return await this.batchSetRegisterValues(payload)
      case 'script.upsert':
        return this.upsertScript(payload)
      case 'script.delete':
        return this.deleteScript(payload)
      case 'script.run':
        return await this.runScript(payload)
      default:
        this.logger?.log({
          level: 'error',
          source: 'cli',
          module: 'cliWorkspace',
          message: `Unknown ui action: ${action}`
        })
        throw new Error(`Unknown ui action: ${action}`)
    }
  }

  private async replaceWorkspace(payload: UiActionPayload): Promise<{ connections: number }> {
    const workspace = payload.workspace as Partial<WorkspaceState> | undefined
    if (!workspace || !Array.isArray(workspace.connections)) {
      throw new Error('workspace.replace requires payload.workspace.connections')
    }

    for (const conn of this.state.connections.filter((conn) => conn.isOpen)) {
      await this.server.deleteServer(conn.id)
    }

    this.state = {
      version: typeof workspace.version === 'number' ? workspace.version : 3,
      connections: workspace.connections as ConnectionEntry[],
      scriptsByConnection: (workspace.scriptsByConnection || {}) as Record<string, ScriptDefinition[]>
    }

    for (const conn of this.state.connections) {
      if (conn.isOpen) {
        await this.openConnection({ connectionId: conn.id })
      }
    }

    return { connections: this.state.connections.length }
  }

  private createConnection(payload: UiActionPayload): { connectionId: string } {
    const connection = payload.connection as ConnectionEntry | undefined
    if (!connection) throw new Error('connection.create requires payload.connection')

    const id = connection.id || uuidv4()
    this.state.connections.push({ ...connection, id, isOpen: false })
    if (!this.state.scriptsByConnection[id]) this.state.scriptsByConnection[id] = []
    return { connectionId: id }
  }

  private updateConnection(payload: UiActionPayload): { connectionId: string } {
    const connectionId = payload.connectionId as string | undefined
    const patch = payload.patch as Partial<ConnectionEntry> | undefined
    if (!connectionId || !patch) throw new Error('connection.update requires connectionId and patch')
    const connection = this.findConnection(connectionId)
    Object.assign(connection, patch)
    return { connectionId }
  }

  private async deleteConnection(payload: UiActionPayload): Promise<void> {
    const connectionId = payload.connectionId as string | undefined
    if (!connectionId) throw new Error('connection.delete requires connectionId')
    const connection = this.findConnection(connectionId)
    if (connection.isOpen) {
      await this.server.deleteServer(connectionId)
    }
    this.state.connections = this.state.connections.filter((conn) => conn.id !== connectionId)
    delete this.state.scriptsByConnection[connectionId]
  }

  private async openConnection(payload: UiActionPayload): Promise<{ address: string }> {
    const connectionId = payload.connectionId as string | undefined
    if (!connectionId) throw new Error('connection.open requires connectionId')
    const connection = this.findConnection(connectionId)
    const params: CreateServerParams = { uuid: connection.id, config: toServerConfig(connection) }
    const address = await this.server.createServer(params)
    await this.syncConnectionToBackend(connection)
    connection.isOpen = true
    return { address }
  }

  private async closeConnection(payload: UiActionPayload): Promise<void> {
    const connectionId = payload.connectionId as string | undefined
    if (!connectionId) throw new Error('connection.close requires connectionId')
    const connection = this.findConnection(connectionId)
    await this.server.deleteServer(connection.id)
    connection.isOpen = false
  }

  private createSlave(payload: UiActionPayload): { slaveId: string } {
    const connectionId = payload.connectionId as string | undefined
    const slave = payload.slave as SlaveEntry | undefined
    if (!connectionId || !slave) throw new Error('slave.create requires connectionId and slave')
    const connection = this.findConnection(connectionId)
    const id = slave.id || uuidv4()
    connection.slaves.push({ ...slave, id })
    return { slaveId: id }
  }

  private updateSlave(payload: UiActionPayload): { slaveId: string } {
    const connectionId = payload.connectionId as string | undefined
    const slaveId = payload.slaveId as string | undefined
    const patch = payload.patch as Partial<SlaveEntry> | undefined
    if (!connectionId || !slaveId || !patch) {
      throw new Error('slave.update requires connectionId, slaveId and patch')
    }
    const slave = this.findSlave(connectionId, slaveId)
    Object.assign(slave, patch)
    return { slaveId }
  }

  private deleteSlave(payload: UiActionPayload): void {
    const connectionId = payload.connectionId as string | undefined
    const slaveId = payload.slaveId as string | undefined
    if (!connectionId || !slaveId) throw new Error('slave.delete requires connectionId and slaveId')
    const connection = this.findConnection(connectionId)
    connection.slaves = connection.slaves.filter((slave) => slave.id !== slaveId)
  }

  private async setRegisterValue(payload: UiActionPayload): Promise<void> {
    const connectionId = payload.connectionId as string | undefined
    const slaveId = payload.slaveId as string | undefined
    const groupId = payload.groupId as string | undefined
    const address = Number(payload.address)
    const value = clampWord(Number(payload.value))

    if (!connectionId || !slaveId || !groupId || !Number.isFinite(address)) {
      throw new Error('register.set requires connectionId, slaveId, groupId, address, value')
    }

    const { connection, slave, group } = this.findGroup(connectionId, slaveId, groupId)
    let register = group.registers.find((item) => item.address === address)
    if (!register) {
      register = { address, value, variableName: '', comment: '' }
      group.registers.push(register)
    } else {
      register.value = value
    }

    if (!connection.isOpen) return
    await this.syncGroupRegisterToBackend(connection.id, slave, group, register)
  }

  private async batchSetRegisterValues(payload: UiActionPayload): Promise<{ count: number }> {
    const connectionId = payload.connectionId as string | undefined
    const slaveId = payload.slaveId as string | undefined
    const groupId = payload.groupId as string | undefined
    const values = payload.values as Record<string, number> | undefined
    if (!connectionId || !slaveId || !groupId || !values) {
      throw new Error('register.batch_set requires connectionId, slaveId, groupId, values')
    }
    let count = 0
    for (const [address, value] of Object.entries(values)) {
      await this.setRegisterValue({
        connectionId,
        slaveId,
        groupId,
        address: Number(address),
        value
      })
      count++
    }
    return { count }
  }

  private upsertScript(payload: UiActionPayload): { scriptId: string } {
    const connectionId = payload.connectionId as string | undefined
    const script = payload.script as ScriptDefinition | undefined
    if (!connectionId || !script) throw new Error('script.upsert requires connectionId and script')
    const scripts = this.state.scriptsByConnection[connectionId] || []
    const id = script.id || uuidv4()
    const idx = scripts.findIndex((item) => item.id === id)
    if (idx === -1) scripts.push({ ...script, id })
    else scripts[idx] = { ...scripts[idx], ...script, id }
    this.state.scriptsByConnection[connectionId] = scripts
    return { scriptId: id }
  }

  private deleteScript(payload: UiActionPayload): void {
    const connectionId = payload.connectionId as string | undefined
    const scriptId = payload.scriptId as string | undefined
    if (!connectionId || !scriptId) throw new Error('script.delete requires connectionId and scriptId')
    const scripts = this.state.scriptsByConnection[connectionId] || []
    this.state.scriptsByConnection[connectionId] = scripts.filter((item) => item.id !== scriptId)
  }

  private async runScript(payload: UiActionPayload): Promise<{ scriptId: string; ranAt: number }> {
    const connectionId = payload.connectionId as string | undefined
    const scriptId = payload.scriptId as string | undefined
    if (!connectionId || !scriptId) throw new Error('script.run requires connectionId and scriptId')
    const script = (this.state.scriptsByConnection[connectionId] || []).find(
      (item) => item.id === scriptId
    )
    if (!script) throw new Error(`script not found: ${scriptId}`)

    const scopeKey = `${connectionId}:${scriptId}`
    const state = this.scriptScopeMap.get(scopeKey) || {}
    this.scriptScopeMap.set(scopeKey, state)

    const api: CliScriptApi = {
      getValue: (unitId: number, registerType: RegisterTypeCode, address: number): number | undefined => {
        const targets = this.findTargets(connectionId, unitId, registerType)
        for (const target of targets) {
          const found = target.group.registers.find((reg) => reg.address === address)
          if (found) return found.value
        }
        return undefined
      },
      setValue: async (
        unitId: number,
        registerType: RegisterTypeCode,
        address: number,
        value: number
      ): Promise<boolean> => {
        const targets = this.findTargets(connectionId, unitId, registerType)
        if (targets.length === 0) return false
        for (const target of targets) {
          await this.setRegisterValue({
            connectionId,
            slaveId: target.slave.id,
            groupId: target.group.id,
            address,
            value
          })
        }
        return true
      },
      setValues: async (
        unitId: number,
        registerType: RegisterTypeCode,
        values: Record<number, number>
      ): Promise<number> => {
        const targets = this.findTargets(connectionId, unitId, registerType)
        if (targets.length === 0) return 0
        for (const target of targets) {
          await this.batchSetRegisterValues({
            connectionId,
            slaveId: target.slave.id,
            groupId: target.group.id,
            values
          })
        }
        return Object.keys(values).length
      },
      log: (...args: unknown[]): void => {
        console.log(`[CLI Script ${connectionId}/${script.name}]`, ...args)
        this.logger?.log({
          level: 'info',
          source: 'script',
          module: 'cliWorkspace',
          message: `[CLI Script ${script.name}] ${args.map((arg) => String(arg)).join(' ')}`,
          connectionId
        })
      }
    }

    const fn = new Function(
      'api',
      'state',
      'event',
      `"use strict"; return (async () => { ${script.code}\n })();`
    ) as (
      api: CliScriptApi,
      state: Record<string, unknown>,
      event: { type: 'manual'; timestamp: number }
    ) => Promise<void>

    this.logger?.log({
      level: 'info',
      source: 'script',
      module: 'cliWorkspace',
      message: `CLI script run started: ${script.name}`,
      connectionId,
      details: { scriptId }
    })

    try {
      await fn(api, state, { type: 'manual', timestamp: Date.now() })
      script.lastRunAt = Date.now()
      script.lastError = undefined
      this.logger?.log({
        level: 'info',
        source: 'script',
        module: 'cliWorkspace',
        message: `CLI script run completed: ${script.name}`,
        connectionId,
        details: { scriptId, ranAt: script.lastRunAt }
      })
      return { scriptId, ranAt: script.lastRunAt }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      script.lastError = message
      this.logger?.log({
        level: 'error',
        source: 'script',
        module: 'cliWorkspace',
        message: `CLI script run failed: ${script.name} - ${message}`,
        connectionId,
        details: { scriptId }
      })
      throw error
    }
  }

  private findConnection(connectionId: string): ConnectionEntry {
    const connection = this.state.connections.find((conn) => conn.id === connectionId)
    if (!connection) throw new Error(`connection not found: ${connectionId}`)
    return connection
  }

  private findSlave(connectionId: string, slaveId: string): SlaveEntry {
    const connection = this.findConnection(connectionId)
    const slave = connection.slaves.find((item) => item.id === slaveId)
    if (!slave) throw new Error(`slave not found: ${slaveId}`)
    return slave
  }

  private findGroup(
    connectionId: string,
    slaveId: string,
    groupId: string
  ): { connection: ConnectionEntry; slave: SlaveEntry; group: RegisterGroupEntry } {
    const connection = this.findConnection(connectionId)
    const slave = connection.slaves.find((item) => item.id === slaveId)
    if (!slave) throw new Error(`slave not found: ${slaveId}`)
    const group = slave.registerGroups.find((item) => item.id === groupId)
    if (!group) throw new Error(`register group not found: ${groupId}`)
    return { connection, slave, group }
  }

  private findTargets(connectionId: string, unitId: number, registerType: RegisterTypeCode) {
    const connection = this.findConnection(connectionId)
    const targets: Array<{ slave: SlaveEntry; group: RegisterGroupEntry }> = []
    connection.slaves.forEach((slave) => {
      if (slave.slaveId !== unitId) return
      slave.registerGroups.forEach((group) => {
        if (group.type === registerType) targets.push({ slave, group })
      })
    })
    return targets
  }

  private async syncConnectionToBackend(connection: ConnectionEntry): Promise<void> {
    for (const slave of connection.slaves) {
      await this.syncSlaveToBackend(connection.id, slave)
    }
  }

  private async syncSlaveToBackend(connectionId: string, slave: SlaveEntry): Promise<void> {
    const unitId = toUnitIdString(slave.slaveId)
    const coils = new Array<boolean>(65535)
    const discreteInputs = new Array<boolean>(65535)
    const registerValues: RegisterParams[] = []

    slave.registerGroups.forEach((group) => {
      const boolType = getBoolType(group.type)
      if (boolType) {
        group.registers.forEach((register) => {
          if (register.address < 0 || register.address >= 65535) return
          if (boolType === 'coils') coils[register.address] = register.value !== 0
          else discreteInputs[register.address] = register.value !== 0
        })
        return
      }

      const numberType = getNumberType(group.type)
      if (!numberType) return
      group.registers.forEach((register) => {
        if (register.address < 0 || register.address >= 65535) return
        registerValues.push(toStaticRegisterParams(register, numberType))
      })
    })

    this.server.syncBools({
      uuid: connectionId,
      unitId,
      coils,
      discrete_inputs: discreteInputs
    })

    this.server.syncServerRegisters({
      uuid: connectionId,
      unitId,
      registerValues,
      littleEndian: false
    })
  }

  private async syncGroupRegisterToBackend(
    connectionId: string,
    slave: SlaveEntry,
    group: RegisterGroupEntry,
    register: RegisterEntry
  ): Promise<void> {
    const unitId = toUnitIdString(slave.slaveId)
    const boolType = getBoolType(group.type)
    if (boolType) {
      this.server.setBool({
        uuid: connectionId,
        unitId,
        registerType: boolType,
        address: register.address,
        state: register.value !== 0
      })
      return
    }

    const numberType = getNumberType(group.type)
    if (!numberType) return
    this.server.addRegister({
      uuid: connectionId,
      unitId,
      littleEndian: false,
      params: toStaticRegisterParams(register, numberType)
    })
  }
}
