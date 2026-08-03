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

const performanceSourceSchema = z
  .object({
    provider: providerSchema,
    sourceUrl: httpsUrlSchema,
    retrievedAt: z.iso.datetime(),
  })
  .strict()

const performanceBase = {
  competition: nonEmptyStringSchema,
  season: nonEmptyStringSchema,
  source: performanceSourceSchema,
}

export const publicPerformanceSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('available'),
      state: observationStateSchema.exclude(['unavailable']),
      stats: athleteStatsSchema,
      ...performanceBase,
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      state: z.literal('unavailable'),
      stats: z.null(),
      ...performanceBase,
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
    affiliation: publicAffiliationSchema,
    performance: publicPerformanceSchema,
    image: publicMediaSchema.optional(),
  })
  .strict()
  .superRefine((athlete, context) => {
    if (athlete.performance.stats && athlete.performance.stats.kind !== athlete.sport) {
      context.addIssue({
        code: 'custom',
        message: 'Stats kind must match athlete sport',
        path: ['performance', 'stats', 'kind'],
      })
    }
    if (athlete.performance.competition !== athlete.affiliation.competition) {
      context.addIssue({
        code: 'custom',
        message: 'Performance competition must match affiliation competition',
        path: ['performance', 'competition'],
      })
    }
    if (athlete.performance.season !== athlete.affiliation.season) {
      context.addIssue({
        code: 'custom',
        message: 'Performance season must match affiliation season',
        path: ['performance', 'season'],
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
        ['eligibility', athlete.eligibility.retrievedAt],
        ['affiliation', athlete.affiliation.source.retrievedAt],
        ['performance', athlete.performance.source.retrievedAt],
        ...(athlete.image ? ([['image', athlete.image.retrievedAt]] as const) : []),
      ] as const
      observations.forEach(([field, retrievedAt]) => {
        if (new Date(retrievedAt).getTime() > generatedMilliseconds) {
          context.addIssue({
            code: 'custom',
            message: `${field} observation cannot be after snapshot generatedAt`,
            path: ['athletes', index, field, 'retrievedAt'],
          })
        }
      })
    })
  })

export type Athlete = z.output<typeof athleteSchema>
export type AthleteStats = z.output<typeof athleteStatsSchema>
export type AthleteSnapshot = z.output<typeof snapshotSchema>
export type PublicAffiliation = z.output<typeof publicAffiliationSchema>
export type PublicEligibility = z.output<typeof publicEligibilitySchema>
export type PublicMedia = z.output<typeof publicMediaSchema>
export type PublicPerformance = z.output<typeof publicPerformanceSchema>
