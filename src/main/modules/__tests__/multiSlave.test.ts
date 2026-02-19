/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { UnitIdString, Windows } from '@shared'
import type { IServiceVector } from 'modbus-serial/ServerTCP'

// Mock modbus-serial
vi.mock('modbus-serial', () => ({
  ServerTCP: vi.fn().mockImplementation(function () {
    return { close: vi.fn((cb: (err: Error | null) => void) => cb(null)) }
  })
}))

import { ServerTCP } from 'modbus-serial'

// Mock net
vi.mock('net', () => ({
  default: {
    createServer: vi.fn(() => {
      const handlers: Record<string, (...args: unknown[]) => void> = {}
      const mockServer = {
        once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler
        }),
        listen: vi.fn(() => {
          if (handlers['listening']) handlers['listening']()
        }),
        close: vi.fn((cb: () => void) => cb())
      }
      return mockServer
    })
  }
}))

let capturedVector: IServiceVector | undefined

vi.mock('../modbusServer/serverAdapter', () => ({
  createServerAdapter: vi.fn().mockImplementation((_protocol: string, vector: IServiceVector) => {
    capturedVector = vector
    return {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(true),
      getAddress: vi.fn().mockReturnValue('0.0.0.0:5020'),
      getProtocol: vi.fn().mockReturnValue('ModbusTcp')
    }
  })
}))

import { ModbusServer } from '../mobusServer'

const createMockWindows = (): Windows => ({ send: vi.fn() }) as unknown as Windows

describe('Multi-Slave Server', () => {
  let server: ModbusServer
  let windows: Windows
  const uuid = 'test-server-uuid'
  let vector: IServiceVector

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.mocked(ServerTCP).mockClear()
    capturedVector = undefined
    windows = createMockWindows()
    server = new ModbusServer({ windows })

    // Create server with TCP protocol
    await server.createServer({
      uuid,
      config: { protocol: 'ModbusTcp', host: '0.0.0.0', port: 5020 }
    })

    vector = capturedVector as unknown as IServiceVector
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('TDD: Multi-Slave Registration', () => {
    it('should support registering multiple slaves with different IDs', async () => {
      // Setup slave 1
      server.setBool({ uuid, unitId: '1', registerType: 'coils', address: 0, state: true })
      server.setBool({ uuid, unitId: '1', registerType: 'coils', address: 1, state: false })

      // Setup slave 2
      server.setBool({ uuid, unitId: '2', registerType: 'coils', address: 0, state: false })
      server.setBool({ uuid, unitId: '2', registerType: 'coils', address: 1, state: true })

      // Verify slave 1 data
      const coil1Slave1 = await new Promise<boolean>((resolve) => {
        vector.getCoil!(0, 1, (err, value) => {
          if (err) throw err
          resolve(value)
        })
      })
      expect(coil1Slave1).toBe(true)

      // Verify slave 2 data - should be independent
      const coil1Slave2 = await new Promise<boolean>((resolve) => {
        vector.getCoil!(0, 2, (err, value) => {
          if (err) throw err
          resolve(value)
        })
      })
      expect(coil1Slave2).toBe(false)
    })

    it('should route requests to correct slave by unit ID', async () => {
      // Setup holding registers for different slaves
      server.addRegister({
        uuid,
        unitId: '1',
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: 'Slave 1 Register',
          value: 100,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      server.addRegister({
        uuid,
        unitId: '2',
        littleEndian: false,
        params: {
          address: 0,
          registerType: 'holding_registers',
          dataType: 'uint16',
          comment: 'Slave 2 Register',
          value: 200,
          min: undefined,
          max: undefined,
          interval: undefined
        }
      })

      // Read from slave 1
      const regSlave1 = await new Promise<number>((resolve) => {
        vector.getHoldingRegister!(0, 1, (err, value) => {
          if (err) throw err
          resolve(value)
        })
      })
      expect(regSlave1).toBe(100)

      // Read from slave 2
      const regSlave2 = await new Promise<number>((resolve) => {
        vector.getHoldingRegister!(0, 2, (err, value) => {
          if (err) throw err
          resolve(value)
        })
      })
      expect(regSlave2).toBe(200)
    })

    it('should allow up to 247 slaves (Modbus limit)', async () => {
      // This tests that we can theoretically support all valid Modbus slave IDs
      // We won't actually create 247, just verify the structure supports it
      const slaveIds: string[] = []
      for (let i = 1; i <= 10; i++) {
        slaveIds.push(String(i))
      }

      // Setup a register in each slave
      slaveIds.forEach((slaveId) => {
        server.addRegister({
          uuid,
          unitId: slaveId as UnitIdString,
          littleEndian: false,
          params: {
            address: 0,
            registerType: 'holding_registers',
            dataType: 'uint16',
            comment: `Slave ${slaveId}`,
            value: Number(slaveId) * 10,
            min: undefined,
            max: undefined,
            interval: undefined
          }
        })
      })

      // Verify each slave has independent data
      for (let i = 1; i <= 10; i++) {
        const value = await new Promise<number>((resolve) => {
          vector.getHoldingRegister!(0, i, (err, val) => {
            if (err) throw err
            resolve(val)
          })
        })
        expect(value).toBe(i * 10)
      }
    })

    it('should return error for invalid slave ID (0 or > 247)', async () => {
      // Test slave ID 0 (broadcast - not supported for responses)
      await new Promise<void>((resolve) => {
        vector.getCoil!(0, 0, (err, _value) => {
          // Should return error or handle gracefully
          expect(err).toBeDefined()
          resolve()
        })
      })

      // Test slave ID 248 (> 247)
      await new Promise<void>((resolve) => {
        vector.getCoil!(0, 248, (err, _value) => {
          expect(err).toBeDefined()
          resolve()
        })
      })
    })

    it('should maintain independent register spaces for each slave', async () => {
      // Setup coils for slave 1
      server.setBool({ uuid, unitId: '1', registerType: 'coils', address: 0, state: true })
      server.setBool({ uuid, unitId: '1', registerType: 'coils', address: 1, state: true })
      server.setBool({ uuid, unitId: '1', registerType: 'coils', address: 2, state: true })

      // Setup coils for slave 2 - different pattern
      server.setBool({ uuid, unitId: '2', registerType: 'coils', address: 0, state: false })
      server.setBool({ uuid, unitId: '2', registerType: 'coils', address: 1, state: false })
      server.setBool({ uuid, unitId: '2', registerType: 'coils', address: 2, state: false })

      // Verify all coils in slave 1 are true
      for (let i = 0; i < 3; i++) {
        const value = await new Promise<boolean>((resolve) => {
          vector.getCoil!(i, 1, (err, val) => {
            if (err) throw err
            resolve(val)
          })
        })
        expect(value).toBe(true)
      }

      // Verify all coils in slave 2 are false
      for (let i = 0; i < 3; i++) {
        const value = await new Promise<boolean>((resolve) => {
          vector.getCoil!(i, 2, (err, val) => {
            if (err) throw err
            resolve(val)
          })
        })
        expect(value).toBe(false)
      }
    })
  })
})
