import {
  RemoveRegisterParams,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  createRegisters,
  createStringRegisters,
  ResetRegistersParams,
  ResetBoolsParams,
  CreateServerParams,
  ServerData,
  ValueGenerators,
  AddRegisterParams,
  UnitIdString,
  UnitIdStringSchema,
  BooleanRegisters,
  NumberRegisters
} from '@shared'
import { Windows } from '@shared'
import { ValueGenerator } from './modbusServer/valueGenerator'
import type { IServiceVector, FCallbackVal } from 'modbus-serial'
import { createServerAdapter, ServerAdapter, TcpServerAdapter } from './modbusServer/serverAdapter'
import type { ServerConnectionConfig, ServerProtocol } from '@shared'
import { TrafficMonitor } from './trafficMonitor'

const getDefaultGenerators = (): ValueGenerators => ({
  input_registers: new Map(),
  holding_registers: new Map()
})

const getDefaultServerData = (): {
  coils: boolean[]
  discrete_inputs: boolean[]
  input_registers: number[]
  holding_registers: number[]
} => ({
  // Sparse arrays: only configured addresses are defined.
  coils: new Array<boolean>(65535),
  discrete_inputs: new Array<boolean>(65535),
  input_registers: new Array<number>(65535),
  holding_registers: new Array<number>(65535)
})

export const ILLEGAL_FUNCTION = 1
export const ILLEGAL_DATA_ADDRESS = 2
export const ILLEGAL_DATA_VALUE = 3
export const SERVER_DEVICE_FAILURE = 4
export const ACKNOWLEDGE = 5
export const SERVER_DEVICE_BUSY = 6
export const NEGATIVE_ACKNOWLEDGE = 7
export const MEMORY_PARITY_ERROR = 8
export const GATEWAY_PATH_UNAVAILABLE = 10
export const GATEWAY_TARGET_FAILED = 11
export const DEFAULT_MOBUS_PORT = 502

type ServerDataUnitMap = Map<UnitIdString, ServerData>
type ValueGeneratorsUnitMap = Map<UnitIdString, ValueGenerators>

type ServerDataMap = Map<string, ServerDataUnitMap>
type ValueGeneratorsMap = Map<string, ValueGeneratorsUnitMap>

export interface ServerParams {
  windows: Windows
}

/**
 * ModbusServer class manages Modbus TCP servers, register data, and value generators for each server and unitId.
 * Handles server creation, deletion, register management, and value generator lifecycle.
 */
export class ModbusServer {
  private _configs: Map<string, ServerConnectionConfig> = new Map()
  private _adapters: Map<string, ServerAdapter> = new Map()
  private _windows: Windows
  private _trafficMonitor: TrafficMonitor

  // Map to store server data for each unit ID of a server UUID
  private _serverData: ServerDataMap = new Map()
  private _generatorMap: ValueGeneratorsMap = new Map()

  /**
   * Construct a ModbusServer instance.
   * @param windows - Windows IPC interface for backend/frontend communication.
   */
  constructor({ windows }: ServerParams) {
    this._windows = windows
    this._trafficMonitor = new TrafficMonitor(windows)
  }

  /**
   * Get the traffic monitor instance.
   */
  getTrafficMonitor(): TrafficMonitor {
    return this._trafficMonitor
  }

  /**
   * Get the Modbus service vector for testing.
   * @internal For testing only
   */
  getVectorForTest(uuid: string): IServiceVector {
    return this._getVector(uuid)
  }

  /**
   * Get all server data for a given UUID (for Excel export)
   * Returns data organized by unit ID and register type
   */
  getServerData(uuid: string): ServerDataUnitMap | undefined {
    return this._serverData.get(uuid)
  }

  /**
   * Ensures an inner map exists for a given UUID in the outer map, creating it if necessary.
   * @param outerMap - The outer map (by UUID)
   * @param uuid - The server UUID
   * @returns The inner map for the UUID
   */
  private _ensureInnerMap<T>(outerMap: Map<string, T>, uuid: string): T {
    let inner = outerMap.get(uuid)
    if (!inner) {
      inner = new Map() as T
      outerMap.set(uuid, inner)
    }
    return inner
  }

  /**
   * Returns a Modbus service vector for a given server UUID.
   * This vector provides all the Modbus register accessors and mutators.
   */
  private _getVector = (uuid: string): IServiceVector => ({
    getCoil: this._getCoil(uuid),
    getDiscreteInput: this._getDiscreteInput(uuid),
    getInputRegister: this._getInputRegister(uuid),
    getHoldingRegister: this._getHoldingRegister(uuid),
    setCoil: this._setCoil(uuid),
    setRegister: this._setHoldingRegister(uuid)
  })

  /**
   * Helper to set server data for a unitId in the server data map.
   */
  private _setServerData(uuid: string, unitId: UnitIdString, serverData: ServerData): void {
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    perUnitMap.set(unitId, serverData)
  }

  /**
   * Helper to dispose all value generators in a ValueGeneratorsUnitMap.
   * This stops all intervals and clears the generator maps.
   */
  private _disposeAllGenerators(unitMap: ValueGeneratorsUnitMap): void {
    for (const registerTypeGenerators of unitMap.values()) {
      registerTypeGenerators.holding_registers.forEach((g) => g.dispose())
      registerTypeGenerators.input_registers.forEach((g) => g.dispose())
    }
  }

  /**
   * Emits a backend message to the frontend via the Windows IPC interface.
   */
  private _emitMessage({
    message,
    variant,
    error
  }: {
    message: string
    variant: 'default' | 'error' | 'success' | 'warning' | 'info'
    error?: Error
  }): void {
    this._windows.send('backend_message', { message, variant, error })
  }

  private _isInvalidRequestSilent(uuid: string): boolean {
    const behavior = this._configs.get(uuid)?.invalidRequestBehavior ?? 'silent'
    return behavior === 'silent'
  }

  /**
   * Creates or recreates a Modbus server for the given UUID and connection config.
   * If a server already exists, it is stopped and replaced.
   * Returns the server address string from the active protocol adapter.
   */
  public createServer = async ({ uuid, config }: CreateServerParams): Promise<string> => {
    const existingAdapter = this._adapters.get(uuid)
    if (existingAdapter) {
      await existingAdapter.stop()
      this._adapters.delete(uuid)
    }

    const vector = this._getVector(uuid)
    const adapter = createServerAdapter(config.protocol, vector, {
      host: config.host,
      port: config.port,
      serial: config.serial,
      onPacket: (packet) => this._trafficMonitor.recordPacket(packet)
    })

    try {
      await adapter.start()
    } catch (error) {
      const startError = error instanceof Error ? error : new Error(String(error))
      this._emitMessage({
        message: `Failed to start ${config.protocol} server`,
        variant: 'error',
        error: startError
      })
      throw startError
    }

    this._adapters.set(uuid, adapter)
    this._configs.set(uuid, config)

    return adapter.getAddress()
  }

  /**
   * Deletes a Modbus server for the given UUID, cleaning up all resources.
   */
  public deleteServer = async (uuid: string): Promise<void> => {
    const adapter = this._adapters.get(uuid)
    if (!adapter) {
      this._emitMessage({ message: `No server found for UUID ${uuid}`, variant: 'error' })
      return
    }

    try {
      await adapter.stop()
    } catch (error) {
      const stopError = error instanceof Error ? error : new Error(String(error))
      this._emitMessage({ message: 'Error closing server', variant: 'error', error: stopError })
    }

    this._adapters.delete(uuid)
    this._configs.delete(uuid)
    this._generatorMap.delete(uuid)
  }

  /**
   * Resets the server for a given UUID.
   * Disposes all value generators, clears server data, and recreates the server.
   */
  public resetServer = async (uuid: string): Promise<void> => {
    const unitIdGenerators = this._generatorMap.get(uuid)
    if (unitIdGenerators) {
      this._disposeAllGenerators(unitIdGenerators)
    }
    this._serverData.delete(uuid)
    this._generatorMap.delete(uuid)
    const config = this._configs.get(uuid)
    if (config) await this.createServer({ uuid, config })
  }

  /**
   * Adds a register or value generator for a given server and unitId.
   * If a generator already exists at the address, it is disposed and replaced.
   * If a fixed value is provided, sets the register directly.
   */
  public addRegister = ({ uuid, unitId, params, littleEndian }: AddRegisterParams): void => {
    const {
      address,
      registerType,
      dataType,
      min,
      max,
      interval,
      value,
      comment,
      stringValue,
      length
    } = params

    // Ensure generator map for this server and unitId
    const perUnitGeneratorMap = this._ensureInnerMap<ValueGeneratorsUnitMap>(
      this._generatorMap,
      uuid
    )
    const serverGenerators = perUnitGeneratorMap.get(unitId) ?? getDefaultGenerators()

    if (!perUnitGeneratorMap.has(unitId)) {
      perUnitGeneratorMap.set(unitId, serverGenerators)
    }

    const generators = serverGenerators[registerType]
    const generator = generators.get(address)
    generator?.dispose()
    generators?.delete(address)

    // Ensure server data map for this server and unitId
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)

    // If a fixed value is provided, set the register directly
    const fixedValue = !interval && value !== undefined
    if (fixedValue) {
      const registers =
        dataType === 'utf8'
          ? createStringRegisters(stringValue ?? '', length ?? 10)
          : createRegisters(dataType, value, littleEndian)
      registers.forEach((register, index) => {
        const registerAddress = address + index
        serverData[registerType][registerAddress] = register
        this._windows.send('register_value', {
          uuid,
          unitId,
          registerType,
          address: registerAddress,
          raw: register
        })
      })
      this._setServerData(uuid, unitId, serverData)
      return
    }

    // Otherwise, add a value generator for this register
    generators.set(
      address,
      new ValueGenerator({
        uuid,
        unitId,
        windows: this._windows,
        serverData,
        address,
        dataType,
        min,
        max,
        interval,
        littleEndian,
        registerType,
        comment,
        stringValue,
        length
      })
    )
  }

  /**
   * Removes a register or value generator for a given server and unitId.
   * Disposes the generator if it exists and resets the register value.
   */
  public removeRegister = ({ uuid, unitId, registerType, address }: RemoveRegisterParams): void => {
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    delete serverData[registerType][address]

    const perUnitGeneratorMap = this._ensureInnerMap<ValueGeneratorsUnitMap>(
      this._generatorMap,
      uuid
    )
    const serverGenerators = perUnitGeneratorMap.get(unitId)
    if (!serverGenerators) return
    const generator = serverGenerators[registerType].get(address)
    if (!generator) return
    generator.dispose()
    serverGenerators[registerType].delete(address)
  }

  /**
   * Synchronizes all register values for a given server and unitId.
   * Resets all holding and input registers, then adds all provided registers.
   */
  public syncServerRegisters = ({
    uuid,
    unitId,
    registerValues,
    littleEndian
  }: SyncRegisterValueParams): void => {
    // Cleanup generators only for this unitId
    const unitIdGenerators = this._generatorMap.get(uuid)
    if (unitIdGenerators) {
      const generators = unitIdGenerators.get(unitId)
      if (generators) {
        generators.holding_registers.forEach((g) => g.dispose())
        generators.input_registers.forEach((g) => g.dispose())
        generators.holding_registers.clear()
        generators.input_registers.clear()
      }
    }
    this.resetRegisters({ uuid, unitId, registerType: 'holding_registers' })
    this.resetRegisters({ uuid, unitId, registerType: 'input_registers' })
    for (const params of registerValues) this.addRegister({ uuid, unitId, params, littleEndian })
  }

  /**
   * Resets all registers of a given type for a server and unitId.
   * Disposes all generators for that register type and clears the register data.
   */
  public resetRegisters = ({ uuid, unitId, registerType }: ResetRegistersParams): void => {
    // Dispose and clear only generators for this unitId and registerType
    const perUnitGeneratorMap = this._ensureInnerMap<ValueGeneratorsUnitMap>(
      this._generatorMap,
      uuid
    )
    const serverGenerators = perUnitGeneratorMap.get(unitId)
    if (serverGenerators) {
      const generators = serverGenerators[registerType]
      generators.forEach((generator) => generator.dispose())
      generators.clear()
    }

    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    serverData[registerType] = new Array<number>(65535)
    this._setServerData(uuid, unitId, serverData)
  }

  /**
   * Sets a boolean value (coil or discrete input) for a given server and unitId.
   * Updates the server data and emits a value change event.
   */
  public setBool = ({ uuid, unitId, registerType, address, state }: SetBooleanParameters): void => {
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    serverData[registerType][address] = state
    this._setServerData(uuid, unitId, serverData)
    this._windows.send('boolean_value', { uuid, unitId, registerType, address, value: state })
  }

  /**
   * Resets all boolean values (coils or discrete inputs) for a given server and unitId.
   */
  public resetBools = ({ uuid, unitId, registerType }: ResetBoolsParams): void => {
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    serverData[registerType] = new Array<boolean>(65535)
    this._setServerData(uuid, unitId, serverData)
  }

  /**
   * Synchronizes all boolean values (coils and discrete inputs) for a given server and unitId.
   */
  public syncBools = (params: SyncBoolsParameters): void => {
    const { uuid, unitId } = params
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    const coils = new Array<boolean>(65535)
    const discreteInputs = new Array<boolean>(65535)
    params['coils'].forEach((value, index) => (coils[index] = value))
    params['discrete_inputs'].forEach((value, index) => {
      discreteInputs[index] = value
    })
    serverData['coils'] = coils
    serverData['discrete_inputs'] = discreteInputs
    this._setServerData(uuid, unitId, serverData)
  }

  /**
   * Sets the port for a given server UUID by recreating the server on the new port.
   * Returns the server address string.
   */
  public setPort = async ({ uuid, config }: CreateServerParams): Promise<string> => {
    const existingConfig = this._configs.get(uuid)
    const existingAdapter = this._adapters.get(uuid)
    const protocol: ServerProtocol =
      config.protocol ??
      existingConfig?.protocol ??
      (existingAdapter instanceof TcpServerAdapter
        ? 'ModbusTcp'
        : (existingAdapter?.getProtocol() ?? 'ModbusTcp'))

    const nextConfig: ServerConnectionConfig = {
      protocol,
      host: config.host ?? existingConfig?.host,
      port: config.port ?? existingConfig?.port ?? DEFAULT_MOBUS_PORT,
      serial: config.serial ?? existingConfig?.serial
    }

    return this.createServer({ uuid, config: nextConfig })
  }

  // -------------------------------------------------------------------------
  // Vector methods for Modbus register access (used by modbus-serial)
  // -------------------------------------------------------------------------

  /**
   * Returns the value of a coil for a given address and unitId.
   * Calls the callback with the value or a Modbus error.
   */
  private _getCoil: (uuid: string) => IServiceVector['getCoil'] =
    (uuid) => async (address, unitIdNumber, cb) => {
      const unitId = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitId.success) return this._mbError(uuid, SERVER_DEVICE_FAILURE, cb, false)

      const value = this._serverData.get(uuid)?.get(unitId.data)?.coils[address]
      if (value === undefined) return this._mbError(uuid, ILLEGAL_DATA_ADDRESS, cb, false)

      cb(null, value)
    }

  /**
   * Returns the value of a discrete input for a given address and unitId.
   * Calls the callback with the value or a Modbus error.
   */
  private _getDiscreteInput: (uuid: string) => IServiceVector['getDiscreteInput'] =
    (uuid) => async (address, unitIdNumber, cb) => {
      const unitId = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitId.success) return this._mbError(uuid, SERVER_DEVICE_FAILURE, cb, false)

      const value = this._serverData.get(uuid)?.get(unitId.data)?.discrete_inputs[address]
      if (value === undefined) return this._mbError(uuid, ILLEGAL_DATA_ADDRESS, cb, false)

      cb(null, value)
    }

  /**
   * Returns the value of an input register for a given address and unitId.
   * Calls the callback with the value or a Modbus error.
   */
  private _getInputRegister: (uuid: string) => IServiceVector['getInputRegister'] =
    (uuid) => async (address, unitId, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitId))
      if (!unitIdSafe.success) return this._mbError(uuid, SERVER_DEVICE_FAILURE, cb, 0)

      const value = this._serverData.get(uuid)?.get(unitIdSafe.data)?.input_registers[address]
      if (value === undefined) return this._mbError(uuid, ILLEGAL_DATA_ADDRESS, cb, 0)

      cb(null, value)
    }

  /**
   * Returns the value of a holding register for a given address and unitId.
   * Calls the callback with the value or a Modbus error.
   */
  private _getHoldingRegister: (uuid: string) => IServiceVector['getHoldingRegister'] =
    (uuid) => async (address, unitId, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitId))
      if (!unitIdSafe.success) return this._mbError(uuid, SERVER_DEVICE_FAILURE, cb, 0)

      const value = this._serverData.get(uuid)?.get(unitIdSafe.data)?.holding_registers[address]
      if (value === undefined) return this._mbError(uuid, ILLEGAL_DATA_ADDRESS, cb, 0)

      cb(null, value)
    }

  /**
   * Sets the value of a coil for a given address and unitId.
   * Updates the server data and emits a value change event.
   */
  private _setCoil: (uuid: string) => IServiceVector['setCoil'] =
    (uuid) => async (address, value, unitIdNumber, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitIdSafe.success) return this._mbError(uuid, SERVER_DEVICE_FAILURE, cb, 0)
      const unitId = unitIdSafe.data

      const currentServerData = this._serverData.get(uuid)?.get(unitId) ?? getDefaultServerData()
      currentServerData.coils[address] = value

      const perUnitMap = this._ensureInnerMap(this._serverData, uuid)
      perUnitMap.set(unitId, currentServerData)

      const registerType: BooleanRegisters = 'coils'
      this._windows.send('boolean_value', { uuid, unitId, registerType, address, value })

      cb(null)
    }

  /**
   * Sets the value of a holding register for a given address and unitId.
   * Updates the server data and emits a value change event.
   */
  private _setHoldingRegister: (uuid: string) => IServiceVector['setRegister'] =
    (uuid) => async (address, raw, unitIdNumber, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitIdSafe.success) return this._mbError(uuid, SERVER_DEVICE_FAILURE, cb, 0)
      const unitId = unitIdSafe.data

      const currentServerData = this._serverData.get(uuid)?.get(unitId) ?? getDefaultServerData()
      currentServerData.holding_registers[address] = raw

      const perUnitMap = this._ensureInnerMap(this._serverData, uuid)
      perUnitMap.set(unitId, currentServerData)

      const registerType: NumberRegisters = 'holding_registers'
      this._windows.send('register_value', { uuid, unitId, registerType, address, raw })

      cb(null)
    }

  /**
   * Helper for returning a Modbus error via callback and emitting a backend message.
   */
  private _mbError<T>(uuid: string, code: number, cb: FCallbackVal<T>, value: T): void {
    if (
      this._isInvalidRequestSilent(uuid) &&
      (code === ILLEGAL_DATA_ADDRESS || code === SERVER_DEVICE_FAILURE)
    ) {
      return
    }
    const err = new Error()
    err['modbusErrorCode'] = code
    cb(err, value)
  }
}
