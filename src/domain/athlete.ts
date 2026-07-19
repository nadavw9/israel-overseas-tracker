import { z } from 'zod'

const basketballStatsSchema = z.object({
  kind: z.literal('basketball'),
  games: z.number().int().nonnegative(),
  pointsPerGame: z.number().nonnegative(),
  reboundsPerGame: z.number().nonnegative(),
  assistsPerGame: z.number().nonnegative(),
})

const footballStatsSchema = z.object({
  kind: z.literal('football'),
  appearances: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
})

const hockeyStatsSchema = z.object({
  kind: z.literal('hockey'),
  games: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
})

export const athleteStatsSchema = z.discriminatedUnion('kind', [
  basketballStatsSchema,
  footballStatsSchema,
  hockeyStatsSchema,
])

export const athleteSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.object({
      en: z.string().trim().min(1),
      he: z.string().trim().min(1),
    }),
    sport: z.enum(['basketball', 'football', 'hockey']),
    competition: z.string().trim().min(1),
    team: z.string().trim().min(1),
    eligibility: z.object({
      status: z.enum(['verified', 'pending']),
      sourceUrl: z.url(),
    }),
    visibility: z.enum(['public', 'review']),
    season: z.string().trim().min(4),
    statsStatus: z.enum(['verified', 'unavailable']),
    stats: athleteStatsSchema.nullable(),
    source: z.object({
      provider: z.string().trim().min(1),
      sourceUrl: z.url(),
      retrievedAt: z.iso.datetime(),
    }),
    freshness: z.enum(['fresh', 'stale', 'identity-only']),
    location: z
      .object({
        city: z.string().trim().min(1),
        country: z.string().trim().min(1),
        lat: z.number().gte(-90).lte(90),
        lng: z.number().gte(-180).lte(180),
      })
      .optional(),
    image: z
      .object({
        url: z.url(),
        sourceUrl: z.url(),
        alt: z.string().trim().min(1),
      })
      .optional(),
  })
  .superRefine((athlete, context) => {
    if (athlete.visibility === 'public' && athlete.eligibility.status !== 'verified') {
      context.addIssue({
        code: 'custom',
        message: 'A public athlete requires verified eligibility',
        path: ['eligibility', 'status'],
      })
    }

    if (athlete.statsStatus === 'verified' && athlete.stats === null) {
      context.addIssue({
        code: 'custom',
        message: 'Verified stats require a stats payload',
        path: ['stats'],
      })
    }

    if (athlete.statsStatus === 'unavailable' && athlete.stats !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Unavailable stats must be null',
        path: ['stats'],
      })
    }

    if (athlete.stats && athlete.stats.kind !== athlete.sport) {
      context.addIssue({
        code: 'custom',
        message: 'Stats kind must match athlete sport',
        path: ['stats', 'kind'],
      })
    }
  })

export const snapshotSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    athletes: z.array(athleteSchema),
  })
  .superRefine((snapshot, context) => {
    const seen = new Set<string>()

    snapshot.athletes.forEach((athlete, index) => {
      if (seen.has(athlete.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate athlete id: ${athlete.id}`,
          path: ['athletes', index, 'id'],
        })
      }
      seen.add(athlete.id)
    })
  })

export type Athlete = z.infer<typeof athleteSchema>
export type AthleteStats = z.infer<typeof athleteStatsSchema>
export type AthleteSnapshot = z.infer<typeof snapshotSchema>
