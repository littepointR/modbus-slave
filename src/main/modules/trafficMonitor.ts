import type { ServerCommPacket, PacketFilter, PacketStats } from '@shared'
import type { Windows } from '@shared'

export type PacketHandler = (packet: ServerCommPacket) => void

export class TrafficMonitor {
  private _packets: ServerCommPacket[] = []
  private _handlers: Set<PacketHandler> = new Set()
  private _windows: Windows
  private _maxPackets = 10000
  private _isRunning = false
  private _packetId = 0

  constructor(windows: Windows) {
    this._windows = windows
  }

  start(): void {
    this._isRunning = true
  }

  stop(): void {
    this._isRunning = false
  }

  isRunning(): boolean {
    return this._isRunning
  }

  clear(): void {
    this._packets = []
    this._packetId = 0
    this._notifyClear()
  }

  onPacket(handler: PacketHandler): () => void {
    this._handlers.add(handler)
    return () => this._handlers.delete(handler)
  }

  recordPacket(packet: Omit<ServerCommPacket, 'id' | 'timestamp'>): void {
    if (!this._isRunning) return

    const fullPacket: ServerCommPacket = {
      ...packet,
      id: ++this._packetId,
      timestamp: Date.now()
    }

    this._packets.push(fullPacket)

    if (this._packets.length > this._maxPackets) {
      this._packets.shift()
    }

    this._notifyHandlers(fullPacket)
    this._emitToRenderer(fullPacket)
  }

  getPackets(filter?: PacketFilter): ServerCommPacket[] {
    if (!filter) return [...this._packets]

    return this._packets.filter((p) => {
      if (filter.slaveId !== undefined && p.slaveId !== filter.slaveId) return false
      if (filter.functionCode !== undefined && p.functionCode !== filter.functionCode) return false
      if (filter.direction !== undefined && p.direction !== filter.direction) return false
      if (filter.startTime !== undefined && p.timestamp < filter.startTime) return false
      if (filter.endTime !== undefined && p.timestamp > filter.endTime) return false
      return true
    })
  }

  getStats(): PacketStats {
    let rxCount = 0
    let txCount = 0
    let exceptionCount = 0
    let bytesTransferred = 0

    for (const p of this._packets) {
      if (p.direction === 'RX') rxCount++
      else txCount++

      if (p.parsed.isException) exceptionCount++
      bytesTransferred += p.data.length
    }

    return {
      totalPackets: this._packets.length,
      rxCount,
      txCount,
      exceptionCount,
      bytesTransferred
    }
  }

  exportToFile(filepath: string): void {
    const lines = this._packets.map((p) =>
      [
        p.id,
        new Date(p.timestamp).toISOString(),
        p.direction,
        p.clientAddr,
        p.slaveId,
        p.functionCode.toString(16).padStart(2, '0'),
        Array.from(p.data)
          .map((b: number) => b.toString(16).padStart(2, '0'))
          .join(' ')
      ].join(',')
    )

    const header = 'ID,Timestamp,Direction,Client,SlaveID,FunctionCode,Data\n'
    const content = header + lines.join('\n')

    const fs = require('fs')
    fs.writeFileSync(filepath, content)
  }

  private _notifyHandlers(packet: ServerCommPacket): void {
    for (const handler of this._handlers) {
      try {
        handler(packet)
      } catch (e) {
        console.error('Packet handler error:', e)
      }
    }
  }

  private _notifyClear(): void {
    this._windows.send('comm_monitor_clear', undefined)
  }

  private _emitToRenderer(packet: ServerCommPacket): void {
    this._windows.send('comm_packet', packet)
  }
}

export function parseMBAPHeader(buffer: Uint8Array): {
  transactionId: number
  protocolId: number
  length: number
  unitId: number
} | null {
  if (buffer.length < 7) return null

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

  return {
    transactionId: view.getUint16(0),
    protocolId: view.getUint16(2),
    length: view.getUint16(4),
    unitId: buffer[6]
  }
}

export function parseModbusPDU(
  buffer: Uint8Array,
  offset = 0
): {
  functionCode: number
  isException: boolean
  data: Uint8Array
} | null {
  if (buffer.length < offset + 1) return null

  const functionCode = buffer[offset]
  const isException = (functionCode & 0x80) !== 0

  return {
    functionCode: functionCode & 0x7f,
    isException,
    data: buffer.slice(offset + 1)
  }
}

export function getFunctionCodeName(code: number): string {
  const codes: Record<number, string> = {
    0x01: 'Read Coils',
    0x02: 'Read Discrete Inputs',
    0x03: 'Read Holding Registers',
    0x04: 'Read Input Registers',
    0x05: 'Write Single Coil',
    0x06: 'Write Single Register',
    0x0f: 'Write Multiple Coils',
    0x10: 'Write Multiple Registers',
    0x17: 'Read/Write Multiple Registers'
  }

  return codes[code] || `Function ${code.toString(16).toUpperCase()}`
}
