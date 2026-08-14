import { z } from 'zod'
import { athleteStatsSchema, httpsUrlSchema } from '../../src/domain/athlete'
import { providerSchema, sportSchema, type ProviderId } from '../../src/domain/taxonomy'
import type { RegistryAthlete } from '../../src/data/registry'

export const providerResultSchema = z
  .object({
    athleteId: z.string().trim().min(1),
    sport: sportSchema,
    competition: z.string().trim().min(1),
    season: z.string().trim().min(1),
    stats: athleteStatsSchema.nullable(),
    state: z.enum(['final', 'provisional', 'corrected']),
    observedOrganization: z.string().trim().min(1).optional(),
    sourceUrl: httpsUrlSchema,
    retrievedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.stats !== null && result.stats.kind !== result.sport) {
      context.addIssue({
        code: 'custom',
        message: 'Stats kind must match provider sport',
        path: ['stats', 'kind'],
      })
    }
  })

export type ProviderResult = z.output<typeof providerResultSchema>

export type ProviderFetchContext = {
  entry: RegistryAthlete
  fetcher: typeof fetch
  now: Date
}

export type ProviderAdapter = (
  context: ProviderFetchContext,
) => Promise<ProviderResult>

export type ProviderAdapterMap = Partial<Record<ProviderId, ProviderAdapter>>

export { providerSchema }
