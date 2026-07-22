import { z } from 'zod'
import { athleteStatsSchema, httpsUrlSchema } from '../../src/domain/athlete'
import type { ProviderResult } from './types'

const curatedRecordSchema = z.object({
  sourceUrl: httpsUrlSchema,
  retrievedAt: z.iso.datetime(),
  stats: athleteStatsSchema.nullable(),
})

export function parseCuratedRecord(
  athleteId: string,
  input: unknown,
): ProviderResult {
  const record = curatedRecordSchema.parse(input)

  return {
    athleteId,
    stats: record.stats,
    state: 'final',
    sourceUrl: record.sourceUrl,
    retrievedAt: record.retrievedAt,
  }
}
