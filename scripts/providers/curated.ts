import { z } from 'zod'
import { athleteStatsSchema } from '../../src/domain/athlete'
import type { ProviderResult } from './types'

const curatedRecordSchema = z.object({
  sourceUrl: z.url(),
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
    sourceUrl: record.sourceUrl,
    retrievedAt: record.retrievedAt,
  }
}
