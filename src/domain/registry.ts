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

const sourceSchema = z.object({
  publisher: nonEmptyStringSchema,
  sourceUrl: httpsUrlSchema,
  retrievedAt: z.iso.datetime(),
})

export const affiliationSchema = z.object({
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
  location: z
    .object({
      city: nonEmptyStringSchema,
      country: nonEmptyStringSchema,
      lat: z.number().gte(-90).lte(90),
      lng: z.number().gte(-180).lte(180),
    })
    .optional(),
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

export const registryBundleSchema = z
  .object({
    athletes: z.array(athleteIdentitySchema),
    evidence: z.array(eligibilityEvidenceSchema),
    affiliations: z.array(affiliationSchema),
    providerBindings: z.array(providerBindingSchema),
    media: z.array(mediaAssetSchema),
  })
  .superRefine((bundle, context) => {
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
    })

    bundle.athletes.forEach((athlete, athleteIndex) => {
      if (athlete.visibility !== 'public') return

      const hasVerifiedEligibility = bundle.evidence.some(
        (claim) => claim.athleteId === athlete.id && claim.status === 'verified',
      )
      if (!hasVerifiedEligibility) {
        context.addIssue({
          code: 'custom',
          message: 'A public athlete requires verified eligibility',
          path: ['athletes', athleteIndex, 'visibility'],
        })
      }

      const currentPrimaryAffiliations = bundle.affiliations.filter(
        (affiliation) =>
          affiliation.athleteId === athlete.id &&
          affiliation.primary &&
          affiliation.rosterStatus === 'active' &&
          affiliation.countsAsOverseas &&
          affiliation.endDate === undefined,
      )
      if (currentPrimaryAffiliations.length !== 1) {
        context.addIssue({
          code: 'custom',
          message: 'A public athlete requires exactly one current primary overseas affiliation',
          path: ['athletes', athleteIndex, 'visibility'],
        })
      }

      const hasVerifiedProviderBinding = bundle.providerBindings.some(
        (binding) => binding.athleteId === athlete.id && binding.status === 'verified',
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
  reviewerNote: nonEmptyStringSchema,
})

export const candidateQueueSchema = z.array(candidateSchema)

export type RegistryBundleInput = z.input<typeof registryBundleSchema>
export type RegistryBundle = z.output<typeof registryBundleSchema>
