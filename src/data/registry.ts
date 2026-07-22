import affiliationsJson from '../../data/registry/affiliations.json'
import athletesJson from '../../data/registry/athletes.json'
import evidenceJson from '../../data/registry/evidence.json'
import mediaJson from '../../data/registry/media.json'
import providerBindingsJson from '../../data/registry/provider-bindings.json'
import { registryBundleSchema, type RegistryBundle } from '../domain/registry'

type AthleteIdentity = RegistryBundle['athletes'][number]
type Eligibility = RegistryBundle['evidence'][number]
type Affiliation = RegistryBundle['affiliations'][number]
type Binding = RegistryBundle['providerBindings'][number]
type Media = RegistryBundle['media'][number]
type SnapshotSport = 'basketball' | 'football' | 'hockey'
type VerifiedEligibility = Eligibility & { status: 'verified' }
type VerifiedBinding = Binding & { status: 'verified' }

export type RegistryAthlete = Omit<AthleteIdentity, 'sport'> & {
  sport: SnapshotSport
  eligibility: VerifiedEligibility
  affiliation: Affiliation
  binding: VerifiedBinding
  image?: Media
  competition: string
  team: string
  season: string
  provider: Binding['provider']
  providerId: string
  location?: Affiliation['location']
}

const registryBundle = registryBundleSchema.parse({
  athletes: athletesJson,
  evidence: evidenceJson,
  affiliations: affiliationsJson,
  providerBindings: providerBindingsJson,
  media: mediaJson,
})

const asOfDate = new Date().toISOString().slice(0, 10)

function currentAffiliation(affiliation: Affiliation): boolean {
  return (
    affiliation.startDate <= asOfDate &&
    (affiliation.endDate === undefined || affiliation.endDate >= asOfDate)
  )
}

function isSnapshotSport(sport: AthleteIdentity['sport']): sport is SnapshotSport {
  return sport === 'basketball' || sport === 'football' || sport === 'hockey'
}

function isVerifiedEligibility(claim: Eligibility): claim is VerifiedEligibility {
  return claim.status === 'verified'
}

function isVerifiedBinding(binding: Binding): binding is VerifiedBinding {
  return binding.status === 'verified'
}

function exactlyOne<T>(records: readonly T[], description: string, athleteId: string): T {
  if (records.length !== 1) {
    throw new Error(`Expected exactly one ${description} for ${athleteId}, found ${records.length}`)
  }

  const [record] = records
  if (record === undefined) {
    throw new Error(`Missing ${description} for ${athleteId}`)
  }
  return record
}

function compilePublicAthlete(athlete: AthleteIdentity): RegistryAthlete {
  if (!isSnapshotSport(athlete.sport)) {
    throw new Error(`Unsupported public snapshot sport for ${athlete.id}: ${athlete.sport}`)
  }

  const eligibility = exactlyOne(
    registryBundle.evidence.filter(
      (claim): claim is VerifiedEligibility =>
        claim.athleteId === athlete.id && isVerifiedEligibility(claim),
    ),
    'verified eligibility claim',
    athlete.id,
  )
  const affiliation = exactlyOne(
    registryBundle.affiliations.filter(
      (record) =>
        record.athleteId === athlete.id &&
        record.primary &&
        record.rosterStatus === 'active' &&
        record.countsAsOverseas &&
        currentAffiliation(record),
    ),
    'current primary active overseas affiliation',
    athlete.id,
  )
  const binding = exactlyOne(
    registryBundle.providerBindings.filter(
      (record): record is VerifiedBinding =>
        record.athleteId === athlete.id && isVerifiedBinding(record),
    ),
    'verified provider binding',
    athlete.id,
  )
  const approvedMedia = registryBundle.media.filter(
    (record) => record.athleteId === athlete.id && record.rightsStatus === 'approved',
  )
  if (approvedMedia.length > 1) {
    throw new Error(`Expected at most one approved media asset for ${athlete.id}`)
  }

  return {
    ...athlete,
    sport: athlete.sport,
    eligibility,
    affiliation,
    binding,
    ...(approvedMedia[0] === undefined ? {} : { image: approvedMedia[0] }),
    competition: affiliation.competition,
    team: affiliation.organization.name,
    season: affiliation.season,
    provider: binding.provider,
    providerId: binding.externalId,
    ...(affiliation.location === undefined ? {} : { location: affiliation.location }),
  }
}

export const publicRegistry = registryBundle.athletes
  .filter((athlete) => athlete.visibility === 'public')
  .map(compilePublicAthlete)
