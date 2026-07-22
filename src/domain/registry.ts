import { z } from 'zod'
import { httpsUrlSchema } from './athlete'
import {
  athleteTierSchema,
  genderCategorySchema,
  lifecycleStatusSchema,
  sportSchema,
  verificationStatusSchema,
  visibilitySchema,
} from './taxonomy'

const nonEmptyStringSchema = z.string().trim().min(1)
const athleteIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const recordIdSchema = nonEmptyStringSchema

export const localizedNameSchema = z.object({
  en: nonEmptyStringSchema,
  he: nonEmptyStringSchema,
})

export const eligibilityBasisSchema = z.enum(['citizenship', 'represents-israel'])

export const organizationTypeSchema = z.enum([
  'club',
  'college',
  'academy',
  'national-team',
  'racing-team',
  'cycling-team',
  'tour-membership',
])

export const rosterStatusSchema = z.enum([
  'active',
  'loan',
  'reserve',
  'injured',
  'suspended',
  'released',
  'unknown',
])

export const providerSchema = z.enum(['espn-nba', 'nhl', 'curated'])

export const identityMatchFieldSchema = z.enum([
  'name',
  'birth-date',
  'team',
  'competition',
  'governing-body-identity',
])

export const mediaRightsStatusSchema = z.enum(['approved', 'review', 'expired'])

export const mediaLicenseSchema = z.enum([
  'provider-terms',
  'club-permission',
  'player-permission',
  'cc-by',
  'cc-by-sa',
  'public-domain',
])

export const mediaUsageSchema = z.enum([
  'editorial-display',
  'remote-editorial-display',
  'commercial-display',
])

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
})

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
})

export const organizationSchema = z.object({
  name: nonEmptyStringSchema,
  type: organizationTypeSchema,
  country: nonEmptyStringSchema,
})

export const locationSchema = z.object({
  city: nonEmptyStringSchema,
  country: nonEmptyStringSchema,
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
})

const sourceSchema = z.object({
  publisher: nonEmptyStringSchema,
  sourceUrl: httpsUrlSchema,
  retrievedAt: z.iso.datetime(),
})

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
  status: verificationStatusSchema,
  matchedOn: z
    .array(identityMatchFieldSchema)
    .min(2)
    .refine((fields) => new Set(fields).size === fields.length, {
      message: 'Provider identity matches must use distinct fields',
    }),
  verifiedAt: z.iso.datetime(),
})

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
  collection: 'athletes' | 'evidence' | 'affiliations' | 'providerBindings' | 'media',
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

export function normalizeRegistryAsOf(asOf: RegistryAsOf) {
  const instant = asOf instanceof Date
    ? asOf.toISOString()
    : z.iso.datetime().safeParse(asOf).success
      ? asOf
      : z.iso.date().safeParse(asOf).success
        ? `${asOf}T23:59:59.999Z`
        : undefined
  if (instant === undefined || Number.isNaN(new Date(instant).getTime())) {
    throw new Error(`Invalid registry as-of instant: ${String(asOf)}`)
  }
  return { instant, date: instant.slice(0, 10) }
}

export function createRegistryBundleSchema(asOf: RegistryAsOf) {
  const { date: asOfDate, instant: asOfInstant } = normalizeRegistryAsOf(asOf)

  return z
  .object({
    athletes: z.array(athleteIdentitySchema),
    evidence: z.array(eligibilityEvidenceSchema),
    affiliations: z.array(affiliationSchema),
    providerBindings: z.array(providerBindingSchema),
    media: z.array(mediaAssetSchema),
  })
  .superRefine((bundle, context) => {
    const recentReleaseCutoff = new Date(`${asOfDate}T00:00:00.000Z`)
    recentReleaseCutoff.setUTCDate(recentReleaseCutoff.getUTCDate() - 90)
    const recentReleaseCutoffDate = recentReleaseCutoff.toISOString().slice(0, 10)

    addDuplicateIdIssues(bundle.athletes, 'athletes', context)
    addDuplicateIdIssues(bundle.evidence, 'evidence', context)
    addDuplicateIdIssues(bundle.affiliations, 'affiliations', context)
    addDuplicateIdIssues(bundle.providerBindings, 'providerBindings', context)
    addDuplicateIdIssues(bundle.media, 'media', context)

    const athleteIds = new Set(bundle.athletes.map((athlete) => athlete.id))
    const referencedCollections = [
      ['evidence', bundle.evidence],
      ['affiliations', bundle.affiliations],
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
    const bindingMatchesAthleteAndProvider = (binding: (typeof bundle.providerBindings)[number]) => {
      const athlete = athletesById.get(binding.athleteId)
      const requiredProviderSport =
        binding.provider === 'curated' ? undefined : providerSport[binding.provider]

      return (
        athlete !== undefined &&
        binding.sport === athlete.sport &&
        (requiredProviderSport === undefined || binding.sport === requiredProviderSport)
      )
    }

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

    bundle.athletes.forEach((athlete, athleteIndex) => {
      if (athlete.visibility !== 'public') return

      const hasVerifiedEligibility = bundle.evidence.some(
        (claim) => claim.athleteId === athlete.id && claim.status === 'verified' && claim.retrievedAt <= asOfInstant,
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
          affiliation.countsAsOverseas,
      )
      const currentPrimaryOverseasAffiliations = primaryOverseasAffiliations.filter(
        (affiliation) =>
          affiliation.startDate <= asOfDate &&
          (affiliation.endDate === undefined || affiliation.endDate >= asOfDate),
      )

      let qualifyingCompetition: string | undefined
      if (athlete.lifecycleStatus === 'active' || athlete.lifecycleStatus === 'injured') {
        const currentActiveAffiliations = currentPrimaryOverseasAffiliations.filter(
          (affiliation) => affiliation.rosterStatus === 'active',
        )
        if (currentActiveAffiliations.length !== 1) {
          context.addIssue({
            code: 'custom',
            message:
              'An active or injured public athlete requires exactly one current primary overseas active affiliation',
            path: ['athletes', athleteIndex, 'lifecycleStatus'],
          })
        }
        qualifyingCompetition = currentActiveAffiliations[0]?.competition
      } else if (athlete.lifecycleStatus === 'free-agent') {
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
        qualifyingCompetition = recentReleasedAffiliations[0]?.competition
      } else {
        context.addIssue({
          code: 'custom',
          message: `A ${athlete.lifecycleStatus} athlete cannot be public`,
          path: ['athletes', athleteIndex, 'lifecycleStatus'],
        })
      }

      const hasVerifiedProviderBinding = bundle.providerBindings.some(
        (binding) =>
          binding.athleteId === athlete.id &&
          binding.status === 'verified' &&
          binding.verifiedAt <= asOfInstant &&
          binding.competition === qualifyingCompetition &&
          bindingMatchesAthleteAndProvider(binding),
      )
      if (!hasVerifiedProviderBinding) {
        context.addIssue({
          code: 'custom',
          message: 'A public athlete requires a verified provider binding',
          path: ['athletes', athleteIndex, 'visibility'],
        })
      }
    })
  })
}

export const registryBundleSchema = createRegistryBundleSchema('2026-07-23T08:00:00.000Z')

const candidateSignalSchema = z.object({
  sourceUrl: httpsUrlSchema,
  sourceType: z.enum(['primary-verification', 'discovery-only']),
  discoveredAt: z.iso.datetime(),
  note: nonEmptyStringSchema,
})

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
