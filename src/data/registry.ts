import affiliationsJson from '../../data/registry/affiliations.json'
import athletesJson from '../../data/registry/athletes.json'
import evidenceJson from '../../data/registry/evidence.json'
import mediaJson from '../../data/registry/media.json'
import providerBindingsJson from '../../data/registry/provider-bindings.json'
import {
  createRegistryBundleSchema,
  normalizeRegistryAsOf,
  registryInstantMs,
  registryMigrationInstant,
  type RegistryAsOf,
  type RegistryBundle,
} from '../domain/registry'

type AthleteIdentity = RegistryBundle['athletes'][number]
type Eligibility = RegistryBundle['evidence'][number]
type Affiliation = RegistryBundle['affiliations'][number]
type Binding = RegistryBundle['providerBindings'][number]
type Media = RegistryBundle['media'][number]
type VerifiedEligibility = Eligibility & { status: 'verified' }
type VerifiedBinding = Binding & { status: 'verified' }
export type ApprovedMedia = Media & {
  rightsStatus: 'approved'
  rightsHolder: string
  license: NonNullable<Media['license']>
}

export type RegistryAthlete = AthleteIdentity & {
  eligibility: VerifiedEligibility
  affiliation: Affiliation
  binding: VerifiedBinding
  image?: ApprovedMedia
}

const bundledData = {
  athletes: athletesJson,
  evidence: evidenceJson,
  affiliations: affiliationsJson,
  providerBindings: providerBindingsJson,
  media: mediaJson,
}

function isVerifiedEligibility(claim: Eligibility): claim is VerifiedEligibility { return claim.status === 'verified' }
function isVerifiedBinding(binding: Binding): binding is VerifiedBinding { return binding.status === 'verified' }
function isApprovedMedia(media: Media): media is ApprovedMedia {
  return media.rightsStatus === 'approved' && media.rightsHolder !== undefined && media.license !== undefined
}
function current(record: Affiliation, asOfDate: string) {
  return record.startDate <= asOfDate && (record.endDate === undefined || record.endDate >= asOfDate)
}
function newest<T extends { id: string }>(records: readonly T[], timestamp: keyof T, description: string, athleteId: string): T {
  const selected = [...records].sort((left, right) => {
    const leftTimestamp = registryInstantMs(String(left[timestamp]))
    const rightTimestamp = registryInstantMs(String(right[timestamp]))
    if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp
    return left.id === right.id ? 0 : left.id < right.id ? -1 : 1
  })[0]
  if (selected === undefined) throw new Error(`Missing ${description} for ${athleteId}`)
  return selected
}
function exactly<T>(records: readonly T[], description: string, athleteId: string): T {
  if (records.length !== 1) throw new Error(`Expected exactly one ${description} for ${athleteId}, found ${records.length}`)
  const record = records[0]
  if (record === undefined) throw new Error(`Missing ${description} for ${athleteId}`)
  return record
}
function releaseCutoff(asOfDate: string) {
  const date = new Date(`${asOfDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 90)
  return date.toISOString().slice(0, 10)
}

function selectAffiliation(bundle: RegistryBundle, athlete: AthleteIdentity, asOfDate: string, asOfMilliseconds: number): Affiliation {
  const primaryOverseas = bundle.affiliations.filter((record) => record.athleteId === athlete.id && record.primary && record.countsAsOverseas && registryInstantMs(record.source.retrievedAt) <= asOfMilliseconds)
  if (athlete.lifecycleStatus === 'active' || athlete.lifecycleStatus === 'injured') {
    const affiliation = exactly(
      primaryOverseas.filter((record) => current(record, asOfDate)),
      'current primary overseas affiliation',
      athlete.id,
    )
    if (affiliation.rosterStatus !== 'active') {
      throw new Error(`The current primary overseas affiliation must have active roster status for ${athlete.id}`)
    }
    return affiliation
  }
  if (athlete.lifecycleStatus === 'free-agent') {
    if (primaryOverseas.some((record) => current(record, asOfDate))) throw new Error(`A public free agent cannot have a current primary overseas affiliation for ${athlete.id}`)
    return exactly(primaryOverseas.filter((record) => record.rosterStatus === 'released' && record.endDate !== undefined && record.endDate >= releaseCutoff(asOfDate) && record.endDate <= asOfDate), 'recent overseas release', athlete.id)
  }
  throw new Error(`A ${athlete.lifecycleStatus} athlete cannot be public: ${athlete.id}`)
}

export function compileRegistryBundle(input: unknown, asOf: RegistryAsOf): RegistryAthlete[] {
  const { date: asOfDate, instant: asOfInstant, milliseconds: asOfMilliseconds } = normalizeRegistryAsOf(asOf)
  const bundle = createRegistryBundleSchema(asOfInstant).parse(input)
  return bundle.athletes.filter((athlete) => athlete.visibility === 'public').map((athlete) => {
    const affiliation = selectAffiliation(bundle, athlete, asOfDate, asOfMilliseconds)
    const eligibility = newest(bundle.evidence.filter((claim): claim is VerifiedEligibility => claim.athleteId === athlete.id && isVerifiedEligibility(claim) && registryInstantMs(claim.retrievedAt) <= asOfMilliseconds), 'retrievedAt', 'verified eligibility claim', athlete.id)
    const binding = newest(bundle.providerBindings.filter((record): record is VerifiedBinding => record.athleteId === athlete.id && isVerifiedBinding(record) && registryInstantMs(record.verifiedAt) <= asOfMilliseconds && record.competition === affiliation.competition), 'verifiedAt', 'verified provider binding matching affiliation competition', athlete.id)
    const approved = bundle.media.filter((record): record is ApprovedMedia => record.athleteId === athlete.id && isApprovedMedia(record) && registryInstantMs(record.retrievedAt) <= asOfMilliseconds)
    const image = approved.length === 0 ? undefined : newest(approved, 'retrievedAt', 'approved media', athlete.id)
    return { ...athlete, sport: athlete.sport, eligibility, affiliation, binding, ...(image === undefined ? {} : { image }) }
  })
}

export function compilePublicRegistry(asOf: RegistryAsOf): RegistryAthlete[] {
  return compileRegistryBundle(bundledData, asOf)
}

export const publicRegistry = compilePublicRegistry(registryMigrationInstant)
