import { z } from 'zod'
import { athleteStatsSchema, httpsUrlSchema } from '../../src/domain/athlete'

export const providerResultSchema = z
  .object({
    athleteId: z.string().trim().min(1),
    sport: z.enum(['basketball', 'football', 'hockey']),
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
