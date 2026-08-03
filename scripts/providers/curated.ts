import { z } from 'zod'
import { athleteStatsSchema, httpsUrlSchema } from '../../src/domain/athlete'
import { sportSchema } from '../../src/domain/taxonomy'
import type { ProviderResult } from './types'
import { providerResultSchema } from './types'

const curatedRecordSchema = z.object({
  sport: sportSchema,
  competition: z.string().trim().min(1),
  season: z.string().trim().min(1),
  sourceUrl: httpsUrlSchema,
  retrievedAt: z.iso.datetime(),
  stats: athleteStatsSchema.nullable(),
  note: z.string().trim().min(1).optional(),
}).strict()

export function parseCuratedRecord(
  athleteId: string,
  input: unknown,
): ProviderResult {
  const record = curatedRecordSchema.parse(input)

  return providerResultSchema.parse({
    athleteId,
    sport: record.sport,
    competition: record.competition,
    season: record.season,
    stats: record.stats,
    state: 'final',
    sourceUrl: record.sourceUrl,
    retrievedAt: record.retrievedAt,
  })
}
