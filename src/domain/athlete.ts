import { z } from 'zod'
import { coverageSummarySchema } from './coverage'
import {
  athleteTierSchema,
  eligibilityBasisSchema,
  genderCategorySchema,
  httpsUrlSchema,
  lifecycleStatusSchema,
  mediaLicenseSchema,
  mediaUsageSchema,
  observationStateSchema,
  organizationTypeSchema,
  providerSchema,
  rosterStatusSchema,
  sportSchema,
} from './taxonomy'

export { httpsUrlSchema } from './taxonomy'

const nonEmptyStringSchema = z.string().trim().min(1)
const localizedNameSchema = z
  .object({
    en: nonEmptyStringSchema,
    he: nonEmptyStringSchema,
  })
  .strict()

const basketballStatsSchema = z
  .object({
    kind: z.literal('basketball'),
    games: z.number().int().nonnegative(),
    pointsPerGame: z.number().nonnegative(),
    reboundsPerGame: z.number().nonnegative(),
    assistsPerGame: z.number().nonnegative(),
  })
  .strict()

const footballStatsSchema = z
  .object({
    kind: z.literal('football'),
    appearances: z.number().int().nonnegative(),
    goals: z.number().int().nonnegative(),
    assists: z.number().int().nonnegative(),
  })
  .strict()

const hockeyStatsSchema = z
  .object({
    kind: z.literal('hockey'),
    games: z.number().int().nonnegative(),
    goals: z.number().int().nonnegative(),
    assists: z.number().int().nonnegative(),
    points: z.number().int().nonnegative(),
  })
  .strict()

export const athleteStatsSchema = z.discriminatedUnion('kind', [
  basketballStatsSchema,
  footballStatsSchema,
  hockeyStatsSchema,
])

const publicSourceSchema = z
  .object({
    publisher: nonEmptyStringSchema,
    sourceUrl: httpsUrlSchema,
    retrievedAt: z.iso.datetime(),
  })
  .strict()

export const publicEligibilitySchema = z
  .object({
    basis: eligibilityBasisSchema,
    sourceUrl: httpsUrlSchema,
    publisher: nonEmptyStringSchema,
    retrievedAt: z.iso.datetime(),
  })
  .strict()

export const publicAffiliationSchema = z
  .object({
    organization: z
      .object({
        name: nonEmptyStringSchema,
        type: organizationTypeSchema,
        country: nonEmptyStringSchema,
      })
      .strict(),
    competition: nonEmptyStringSchema,
    season: nonEmptyStringSchema,
    rosterStatus: rosterStatusSchema,
    countsAsOverseas: z.literal(true),
    source: publicSourceSchema,
    location: z
      .object({
        city: nonEmptyStringSchema,
        country: nonEmptyStringSchema,
        lat: z.number().gte(-90).lte(90),
        lng: z.number().gte(-180).lte(180),
      })
      .strict()
      .optional(),
  })
  .strict()

export const publicCircuitActivitySchema = z
  .object({
    circuit: z.enum(['ATP', 'WTA', 'ITF']),
    discipline: z.enum(['singles', 'doubles']),
    competition: nonEmptyStringSchema,
    season: nonEmptyStringSchema,
    activityType: z.enum(['ranking', 'sanctioned-result']),
    effectiveAt: z.iso.datetime(),
    source: publicSourceSchema,
  })
  .strict()

export const publicParticipationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('team-affiliation'),
    affiliation: publicAffiliationSchema,
  }).strict(),
  z.object({
    kind: z.literal('circuit-activity'),
    activity: publicCircuitActivitySchema,
  }).strict(),
])

const performanceSourceSchema = z
  .object({
    provider: providerSchema,
    sourceUrl: httpsUrlSchema,
    retrievedAt: z.iso.datetime(),
  })
  .strict()

export const publicPerformanceSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('available'),
      state: observationStateSchema.exclude(['unavailable']),
      competition: nonEmptyStringSchema,
      season: nonEmptyStringSchema,
      stats: athleteStatsSchema,
      source: performanceSourceSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      state: z.literal('unavailable'),
      stats: z.null(),
      reason: z.enum(['not-integrated', 'provider-unavailable']),
    })
    .strict(),
])

export const publicMediaSchema = z
  .object({
    url: httpsUrlSchema,
    sourceUrl: httpsUrlSchema,
    alt: nonEmptyStringSchema,
    rightsStatus: z.literal('approved'),
    rightsHolder: nonEmptyStringSchema,
    license: mediaLicenseSchema,
    usage: mediaUsageSchema,
    retrievedAt: z.iso.datetime(),
    attribution: nonEmptyStringSchema.optional(),
  })
  .strict()

export const athleteSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: localizedNameSchema,
    aliases: z.array(nonEmptyStringSchema),
    sport: sportSchema,
    discipline: nonEmptyStringSchema.optional(),
    genderCategory: genderCategorySchema,
    tier: athleteTierSchema,
    lifecycleStatus: lifecycleStatusSchema,
    visibility: z.literal('public'),
    eligibility: publicEligibilitySchema,
    participation: publicParticipationSchema,
    performance: publicPerformanceSchema,
    image: publicMediaSchema.optional(),
  })
  .strict()
  .superRefine((athlete, context) => {
    if (athlete.performance.status !== 'available') return

    if (athlete.performance.stats.kind !== athlete.sport) {
      context.addIssue({
        code: 'custom',
        message: 'Stats kind must match athlete sport',
        path: ['performance', 'stats', 'kind'],
      })
    }
    const participationCompetition = athlete.participation.kind === 'team-affiliation'
      ? athlete.participation.affiliation.competition
      : athlete.participation.activity.competition
    if (athlete.performance.competition !== participationCompetition) {
      context.addIssue({
        code: 'custom',
        message: 'Performance competition must match participation competition',
        path: ['performance', 'competition'],
      })
    }
  })

export const snapshotSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    athletes: z.array(athleteSchema),
    coverage: coverageSummarySchema,
  })
  .strict()
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

      const generatedMilliseconds = new Date(snapshot.generatedAt).getTime()
      const observations = [
        {
          label: 'eligibility',
          instant: athlete.eligibility.retrievedAt,
          path: ['eligibility', 'retrievedAt'],
        },
        ...(athlete.participation.kind === 'team-affiliation'
          ? [{
              label: 'participation',
              instant: athlete.participation.affiliation.source.retrievedAt,
              path: ['participation', 'affiliation', 'source', 'retrievedAt'],
            }]
          : [
              {
                label: 'participation',
                instant: athlete.participation.activity.source.retrievedAt,
                path: ['participation', 'activity', 'source', 'retrievedAt'],
              },
              {
                label: 'participation',
                instant: athlete.participation.activity.effectiveAt,
                path: ['participation', 'activity', 'effectiveAt'],
              },
            ]),
        ...(athlete.performance.status === 'available'
          ? [{
              label: 'performance',
              instant: athlete.performance.source.retrievedAt,
              path: ['performance', 'source', 'retrievedAt'],
            }]
          : []),
        ...(athlete.image
          ? [{ label: 'image', instant: athlete.image.retrievedAt, path: ['image', 'retrievedAt'] }]
          : []),
      ]
      observations.forEach(({ label, instant, path }) => {
        if (new Date(instant).getTime() > generatedMilliseconds) {
          context.addIssue({
            code: 'custom',
            message: `${label} observation cannot be after snapshot generatedAt`,
            path: ['athletes', index, ...path],
          })
        }
      })
    })
  })

export type Athlete = z.output<typeof athleteSchema>
export type AthleteStats = z.output<typeof athleteStatsSchema>
export type AthleteSnapshot = z.output<typeof snapshotSchema>
export type PublicAffiliation = z.output<typeof publicAffiliationSchema>
export type PublicCircuitActivity = z.output<typeof publicCircuitActivitySchema>
export type PublicEligibility = z.output<typeof publicEligibilitySchema>
export type PublicMedia = z.output<typeof publicMediaSchema>
export type PublicParticipation = z.output<typeof publicParticipationSchema>
export type PublicPerformance = z.output<typeof publicPerformanceSchema>
