import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SystemLogger } from '../systemLogger'

describe('SystemLogger', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }))
    tempDirs.length = 0
  })

  it('records entries and computes stats', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modbux-logger-'))
    tempDirs.push(dir)
    const windows = { send: vi.fn() } as any
    const logger = new SystemLogger(windows, dir)

    logger.log({
      level: 'info',
      source: 'system',
      module: 'test',
      message: 'hello'
    })
    logger.log({
      level: 'error',
      source: 'script',
      module: 'test',
      message: 'boom'
    })

    const stats = logger.getStats()
    expect(stats.total).toBe(2)
    expect(stats.byLevel.info).toBe(1)
    expect(stats.byLevel.error).toBe(1)
    expect(stats.bySource.system).toBe(1)
    expect(stats.bySource.script).toBe(1)
  })

  it('exports and clears entries', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modbux-logger-'))
    tempDirs.push(dir)
    const windows = { send: vi.fn() } as any
    const logger = new SystemLogger(windows, dir)

    logger.log({
      level: 'warn',
      source: 'workspace',
      module: 'test',
      message: 'saved'
    })

    const output = path.join(dir, 'export.log')
    logger.exportToFile(output)
    const text = fs.readFileSync(output, 'utf8')
    expect(text).toContain('"source":"workspace"')

    logger.clear()
    expect(logger.getStats().total).toBe(0)
  })
})
