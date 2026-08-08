import { z } from 'zod'
import {
  athleteTierSchema,
  eligibilityBasisSchema,
  genderCategorySchema,
  httpsUrlSchema,
  lifecycleStatusSchema,
  mediaLicenseSchema,
  mediaUsageSchema,
  organizationTypeSchema,
  providerSchema,
  rosterStatusSchema,
  sportSchema,
  verificationStatusSchema,
  visibilitySchema,
} from './taxonomy'

export {
  eligibilityBasisSchema,
  mediaLicenseSchema,
  mediaUsageSchema,
  organizationTypeSchema,
  providerSchema,
  rosterStatusSchema,
} from './taxonomy'

const nonEmptyStringSchema = z.string().trim().min(1)
const athleteIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const recordIdSchema = nonEmptyStringSchema

export const localizedNameSchema = z.object({
  en: nonEmptyStringSchema,
  he: nonEmptyStringSchema,
}).strict()

export const identityMatchFieldSchema = z.enum([
  'name',
  'birth-date',
  'team',
  'competition',
  'governing-body-identity',
])

export const mediaRightsStatusSchema = z.enum(['approved', 'review', 'expired'])

export const candidateStateSchema = z.enum([
  'new',
  'needs-evidence',
  'identity-conflict',
  'affiliation-conflict',
  'approved',
  'rejected',
  'superseded',
])

export const athleteIdentitySchema = z.object({
  id: athleteIdSchema,
  name: localizedNameSchema,
  aliases: z.array(nonEmptyStringSchema),
  sport: sportSchema,
  discipline: nonEmptyStringSchema.optional(),
  genderCategory: genderCategorySchema,
  tier: athleteTierSchema,
  lifecycleStatus: lifecycleStatusSchema,
  visibility: visibilitySchema,
  birthDate: z.iso.date().optional(),
  paraClassification: nonEmptyStringSchema.optional(),
}).strict()

const matchedOnSchema = z.array(identityMatchFieldSchema).min(1)

export const eligibilityEvidenceSchema = z.object({
  id: recordIdSchema,
  athleteId: athleteIdSchema,
  basis: eligibilityBasisSchema,
  status: verificationStatusSchema,
  publisher: nonEmptyStringSchema,
  sourceUrl: httpsUrlSchema,
  retrievedAt: z.iso.datetime(),
  matchedOn: matchedOnSchema,
}).strict()

export const organizationSchema = z.object({
  name: nonEmptyStringSchema,
  type: organizationTypeSchema,
  country: nonEmptyStringSchema,
}).strict()

export const locationSchema = z.object({
  city: nonEmptyStringSchema,
  country: nonEmptyStringSchema,
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
}).strict()

const sourceSchema = z.object({
  publisher: nonEmptyStringSchema,
  sourceUrl: httpsUrlSchema,
  retrievedAt: z.iso.datetime(),
}).strict()

export const circuitActivitySchema = z.object({
  id: recordIdSchema,
  athleteId: athleteIdSchema,
  circuit: z.enum(['ATP', 'WTA', 'ITF']),
  discipline: z.enum(['singles', 'doubles']),
  competition: nonEmptyStringSchema,
  season: nonEmptyStringSchema,
  activityType: z.enum(['ranking', 'sanctioned-result']),
  effectiveAt: z.iso.datetime(),
  status: verificationStatusSchema,
  source: sourceSchema,
}).strict()

export const affiliationSchema = z
  .object({
    id: recordIdSchema,
    athleteId: athleteIdSchema,
    organization: organizationSchema,
    competition: nonEmptyStringSchema,
    season: nonEmptyStringSchema,
    startDate: z.iso.date(),
    endDate: z.iso.date().optional(),
    primary: z.boolean(),
    rosterStatus: rosterStatusSchema,
    countsAsOverseas: z.boolean(),
    source: sourceSchema,
    location: locationSchema.optional(),
  })
  .strict()
  .superRefine((affiliation, context) => {
    if (affiliation.endDate && affiliation.endDate < affiliation.startDate) {
      context.addIssue({
        code: 'custom',
        message: 'Affiliation end date cannot precede its start date',
        path: ['endDate'],
      })
    }
  })

export const providerBindingSchema = z.object({
  id: recordIdSchema,
  athleteId: athleteIdSchema,
  provider: providerSchema,
  externalId: nonEmptyStringSchema,
  sport: sportSchema,
  competition: nonEmptyStringSchema,
  season: nonEmptyStringSchema,
  status: verificationStatusSchema,
  matchedOn: z
    .array(identityMatchFieldSchema)
    .min(2)
    .refine((fields) => new Set(fields).size === fields.length, {
      message: 'Provider identity matches must use distinct fields',
    }),
  verifiedAt: z.iso.datetime(),
}).strict()

export const mediaAssetSchema = z
  .object({
    id: recordIdSchema,
    athleteId: athleteIdSchema,
    url: httpsUrlSchema,
    sourceUrl: httpsUrlSchema,
    rightsStatus: mediaRightsStatusSchema,
    rightsHolder: nonEmptyStringSchema.optional(),
    license: mediaLicenseSchema.optional(),
    usage: mediaUsageSchema,
    attribution: nonEmptyStringSchema.optional(),
    retrievedAt: z.iso.datetime(),
    alt: nonEmptyStringSchema,
  })
  .strict()
  .superRefine((asset, context) => {
    if (asset.rightsStatus !== 'approved') return

    if (!asset.rightsHolder) {
      context.addIssue({
        code: 'custom',
        message: 'Approved media requires a rights holder',
        path: ['rightsHolder'],
      })
    }

    if (!asset.license) {
      context.addIssue({
        code: 'custom',
        message: 'Approved media requires a license',
        path: ['license'],
      })
    }
  })

const addDuplicateIdIssues = (
  records: ReadonlyArray<{ id: string }>,
  collection: 'athletes' | 'evidence' | 'affiliations' | 'circuitActivities' | 'providerBindings' | 'media',
  context: z.RefinementCtx,
) => {
  const seen = new Set<string>()

  records.forEach((record, index) => {
    if (seen.has(record.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate ${collection} id: ${record.id}`,
        path: [collection, index, 'id'],
      })
    }
    seen.add(record.id)
  })
}

export type RegistryAsOf = Date | string
/** Required provenance watermark for the normalized registry migration. */
export const registryMigrationInstant = '2026-07-23T08:00:00.000Z'

export function registryInstantMs(value: Date | string) {
  const milliseconds = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(milliseconds)) throw new Error(`Invalid registry instant: ${String(value)}`)
  return milliseconds
}

export function normalizeRegistryAsOf(asOf: RegistryAsOf) {
  const input = asOf instanceof Date
    ? asOf
    : z.iso.datetime().safeParse(asOf).success
      ? asOf
      : z.iso.date().safeParse(asOf).success
        ? `${asOf}T23:59:59.999Z`
        : undefined
  if (input === undefined) {
    throw new Error(`Invalid registry as-of instant: ${String(asOf)}`)
  }
  const milliseconds = registryInstantMs(input)
  const instant = new Date(milliseconds).toISOString()
  return { instant, date: instant.slice(0, 10), milliseconds }
}

export function createRegistryBundleSchema(asOf: RegistryAsOf) {
  const { date: asOfDate, milliseconds: asOfMilliseconds } = normalizeRegistryAsOf(asOf)
  const atOrBeforeAsOf = (instant: string) => registryInstantMs(instant) <= asOfMilliseconds
  const circuitActivityCutoffMilliseconds = asOfMilliseconds - (365 * 24 * 60 * 60 * 1_000)

  return z
  .object({
    athletes: z.array(athleteIdentitySchema),
    evidence: z.array(eligibilityEvidenceSchema),
    affiliations: z.array(affiliationSchema),
    circuitActivities: z.array(circuitActivitySchema),
    providerBindings: z.array(providerBindingSchema),
    media: z.array(mediaAssetSchema),
  })
  .strict()
  .superRefine((bundle, context) => {
    const recentReleaseCutoff = new Date(`${asOfDate}T00:00:00.000Z`)
    recentReleaseCutoff.setUTCDate(recentReleaseCutoff.getUTCDate() - 90)
    const recentReleaseCutoffDate = recentReleaseCutoff.toISOString().slice(0, 10)

    addDuplicateIdIssues(bundle.athletes, 'athletes', context)
    addDuplicateIdIssues(bundle.evidence, 'evidence', context)
    addDuplicateIdIssues(bundle.affiliations, 'affiliations', context)
    addDuplicateIdIssues(bundle.circuitActivities, 'circuitActivities', context)
    addDuplicateIdIssues(bundle.providerBindings, 'providerBindings', context)
    addDuplicateIdIssues(bundle.media, 'media', context)

    const athleteIds = new Set(bundle.athletes.map((athlete) => athlete.id))
    const referencedCollections = [
      ['evidence', bundle.evidence],
      ['affiliations', bundle.affiliations],
      ['circuitActivities', bundle.circuitActivities],
      ['providerBindings', bundle.providerBindings],
      ['media', bundle.media],
    ] as const

    referencedCollections.forEach(([collection, records]) => {
      records.forEach((record, index) => {
        if (!athleteIds.has(record.athleteId)) {
          context.addIssue({
            code: 'custom',
            message: `Unknown athlete id: ${record.athleteId}`,
            path: [collection, index, 'athleteId'],
          })
        }
      })
    })

    const athletesById = new Map(bundle.athletes.map((athlete) => [athlete.id, athlete]))
    const providerSport = {
      'espn-nba': 'basketball',
      nhl: 'hockey',
    } as const
    const providerIdentities = new Set<string>()
    bundle.providerBindings.forEach((binding, index) => {
      const identity = `${binding.provider}\u0000${binding.externalId}`
      if (providerIdentities.has(identity)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate provider identity: ${binding.provider}/${binding.externalId}`,
          path: ['providerBindings', index, 'externalId'],
        })
      }
      providerIdentities.add(identity)

      const athlete = athletesById.get(binding.athleteId)
      if (athlete && binding.sport !== athlete.sport) {
        context.addIssue({
          code: 'custom',
          message: `Binding sport ${binding.sport} does not match athlete sport ${athlete.sport}`,
          path: ['providerBindings', index, 'sport'],
        })
      }

      const requiredProviderSport =
        binding.provider === 'curated' ? undefined : providerSport[binding.provider]
      if (requiredProviderSport && binding.sport !== requiredProviderSport) {
        context.addIssue({
          code: 'custom',
          message: `${binding.provider} bindings require sport ${requiredProviderSport}`,
          path: ['providerBindings', index, 'provider'],
        })
      }
    })

    bundle.circuitActivities.forEach((activity, index) => {
      if (!atOrBeforeAsOf(activity.effectiveAt)) {
        context.addIssue({
          code: 'custom',
          message: 'Circuit activity effective time cannot be after the registry as-of instant',
          path: ['circuitActivities', index, 'effectiveAt'],
        })
      }
      if (!atOrBeforeAsOf(activity.source.retrievedAt)) {
        context.addIssue({
          code: 'custom',
          message: 'Circuit activity source cannot be retrieved after the registry as-of instant',
          path: ['circuitActivities', index, 'source', 'retrievedAt'],
        })
      }
    })

    bundle.athletes.forEach((athlete, athleteIndex) => {
      if (athlete.visibility !== 'public') return

      const hasVerifiedEligibility = bundle.evidence.some(
        (claim) => claim.athleteId === athlete.id && claim.status === 'verified' && atOrBeforeAsOf(claim.retrievedAt),
      )
      if (!hasVerifiedEligibility) {
        context.addIssue({
          code: 'custom',
          message: 'A public athlete requires verified eligibility',
          path: ['athletes', athleteIndex, 'visibility'],
        })
      }

      const primaryOverseasAffiliations = bundle.affiliations.filter(
        (affiliation) =>
          affiliation.athleteId === athlete.id &&
          affiliation.primary &&
          affiliation.countsAsOverseas &&
          atOrBeforeAsOf(affiliation.source.retrievedAt),
      )
      const currentPrimaryOverseasAffiliations = primaryOverseasAffiliations.filter(
        (affiliation) =>
          affiliation.startDate <= asOfDate &&
          (affiliation.endDate === undefined || affiliation.endDate >= asOfDate),
      )
      const qualifyingCircuitActivities = bundle.circuitActivities.filter(
        (activity) =>
          activity.athleteId === athlete.id &&
          activity.status === 'verified' &&
          atOrBeforeAsOf(activity.effectiveAt) &&
          atOrBeforeAsOf(activity.source.retrievedAt) &&
          registryInstantMs(activity.effectiveAt) >= circuitActivityCutoffMilliseconds,
      )

      if (qualifyingCircuitActivities.length > 1) {
        const newestEffectiveAt = Math.max(
          ...qualifyingCircuitActivities.map((activity) => registryInstantMs(activity.effectiveAt)),
        )
        if (qualifyingCircuitActivities.filter(
          (activity) => registryInstantMs(activity.effectiveAt) === newestEffectiveAt,
        ).length > 1) {
          context.addIssue({
            code: 'custom',
            message: 'Ambiguous newest qualifying circuit activity',
            path: ['athletes', athleteIndex, 'tier'],
          })
        }
      }

      if (athlete.tier === 'international-circuit') {
        if (athlete.lifecycleStatus !== 'active' && athlete.lifecycleStatus !== 'injured') {
          context.addIssue({
            code: 'custom',
            message: `A ${athlete.lifecycleStatus} athlete cannot be public`,
            path: ['athletes', athleteIndex, 'lifecycleStatus'],
          })
        }
        if (currentPrimaryOverseasAffiliations.length !== 0) {
          context.addIssue({
            code: 'custom',
            message: 'A public international-circuit athlete cannot have a current primary overseas affiliation',
            path: ['athletes', athleteIndex, 'tier'],
          })
        }
        if (qualifyingCircuitActivities.length === 0) {
          context.addIssue({
            code: 'custom',
            message: 'A public international-circuit athlete requires a verified current circuit activity',
            path: ['athletes', athleteIndex, 'tier'],
          })
        }
      } else if (athlete.lifecycleStatus === 'active' || athlete.lifecycleStatus === 'injured') {
        if (currentPrimaryOverseasAffiliations.length !== 1) {
          context.addIssue({
            code: 'custom',
            message:
              'An active or injured public athlete requires exactly one current primary overseas affiliation',
            path: ['athletes', athleteIndex, 'lifecycleStatus'],
          })
        } else if (currentPrimaryOverseasAffiliations[0]?.rosterStatus !== 'active') {
          context.addIssue({
            code: 'custom',
            message: 'The current primary overseas affiliation must have active roster status',
            path: ['athletes', athleteIndex, 'lifecycleStatus'],
          })
        }
      } else if (athlete.lifecycleStatus === 'free-agent') {
        // Preserve the existing public free-agent exception: its participation is the
        // single qualifying release from the previous 90 days, not a current roster.
        if (currentPrimaryOverseasAffiliations.length !== 0) {
          context.addIssue({
            code: 'custom',
            message: 'A public free agent cannot have a current primary overseas affiliation',
            path: ['athletes', athleteIndex, 'lifecycleStatus'],
          })
        }

        const recentReleasedAffiliations = primaryOverseasAffiliations.filter(
          (affiliation) =>
            affiliation.rosterStatus === 'released' &&
            affiliation.endDate !== undefined &&
            affiliation.endDate >= recentReleaseCutoffDate &&
            affiliation.endDate <= asOfDate,
        )
        if (recentReleasedAffiliations.length !== 1) {
          context.addIssue({
            code: 'custom',
            message: 'A public free agent requires one overseas release within the previous 90 days',
            path: ['athletes', athleteIndex, 'lifecycleStatus'],
          })
        }
      } else {
        context.addIssue({
          code: 'custom',
          message: `A ${athlete.lifecycleStatus} athlete cannot be public`,
          path: ['athletes', athleteIndex, 'lifecycleStatus'],
        })
      }

      if (athlete.tier !== 'international-circuit' && qualifyingCircuitActivities.length !== 0) {
        context.addIssue({
          code: 'custom',
          message: 'A public team athlete cannot also have a qualifying circuit activity',
          path: ['athletes', athleteIndex, 'tier'],
        })
      }
    })
  })
}

export const registryBundleSchema = createRegistryBundleSchema(registryMigrationInstant)

const candidateSignalSchema = z.object({
  sourceUrl: httpsUrlSchema,
  sourceType: z.enum(['primary-verification', 'discovery-only']),
  discoveredAt: z.iso.datetime(),
  note: nonEmptyStringSchema,
}).strict()

export const candidateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: localizedNameSchema,
  sport: sportSchema,
  tier: athleteTierSchema,
  genderCategory: genderCategorySchema,
  state: candidateStateSchema,
  signals: z.array(candidateSignalSchema).min(1),
  proposedAffiliation: z
    .object({
      organization: nonEmptyStringSchema,
      competition: nonEmptyStringSchema,
      season: z.string().trim().min(4),
    })
    .strict()
    .optional(),
  location: locationSchema.optional(),
  reviewerNote: nonEmptyStringSchema,
}).strict()

export const candidateQueueSchema = z.array(candidateSchema).superRefine((candidates, context) => {
  const seen = new Set<string>()

  candidates.forEach((candidate, index) => {
    if (seen.has(candidate.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate candidate id: ${candidate.id}`,
        path: [index, 'id'],
      })
    }
    seen.add(candidate.id)
  })
})

export type RegistryBundleInput = z.input<typeof registryBundleSchema>
export type RegistryBundle = z.output<typeof registryBundleSchema>
