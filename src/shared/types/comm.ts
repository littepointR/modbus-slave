import { z } from 'zod'
import { ServerProtocolSchema } from './server'

export const CommDirectionSchema = z.enum(['RX', 'TX'])
export type CommDirection = z.infer<typeof CommDirectionSchema>

export const FrameTypeSchema = z.enum(['MBAP', 'RTU', 'ASCII'])
export type FrameType = z.infer<typeof FrameTypeSchema>

export const ServerCommPacketSchema = z.object({
  id: z.number(),
  timestamp: z.number(),
  direction: CommDirectionSchema,
  protocol: ServerProtocolSchema,
  frameType: FrameTypeSchema,
  clientAddr: z.string(),
  slaveId: z.number(),
  functionCode: z.number(),
  data: z.instanceof(Uint8Array),
  parsed: z.object({
    startAddress: z.number().optional(),
    quantity: z.number().optional(),
    values: z.array(z.number()).optional(),
    exception: z.number().optional(),
    isException: z.boolean().optional()
  })
})

export type ServerCommPacket = z.infer<typeof ServerCommPacketSchema>

export interface PacketFilter {
  slaveId?: number
  functionCode?: number
  direction?: CommDirection
  startTime?: number
  endTime?: number
}

export interface PacketStats {
  totalPackets: number
  rxCount: number
  txCount: number
  exceptionCount: number
  bytesTransferred: number
  bufferBytes: number
  bufferLimitBytes: number
}
