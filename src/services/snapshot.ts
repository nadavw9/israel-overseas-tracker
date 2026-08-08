import type { ProviderResult } from '../../scripts/providers/types'
import type { RegistryAthlete } from '../data/registry'
import {
  snapshotSchema,
  type Athlete,
  type AthleteSnapshot,
  type PublicPerformance,
} from '../domain/athlete'
import type { CoverageSummary } from '../domain/coverage'
import { isObservationWithinRetention } from '../domain/observation'
import { providerResultSchema } from '../../scripts/providers/types'

export type PreviousSnapshot = {
  athletes: Array<Pick<Athlete, 'id' | 'performance'>>
}

type BuildSnapshotOptions = {
  entries: RegistryAthlete[]
  previous: PreviousSnapshot
  coverage: CoverageSummary
  fetchRecord: (entry: RegistryAthlete) => Promise<ProviderResult>
  now: Date
}

function normalizeOrganization(value: string) {
  return (value.normalize('NFKD').match(/[\p{L}\p{N}]/gu) ?? [])
    .join('')
    .toLocaleLowerCase('en')
}

function participationCompetition(entry: RegistryAthlete): string {
  return entry.participation.kind === 'team-affiliation'
    ? entry.participation.affiliation.competition
    : entry.participation.activity.competition
}

function unavailablePerformance(
  reason: 'not-integrated' | 'provider-unavailable',
): PublicPerformance {
  return {
    status: 'unavailable',
    state: 'unavailable',
    stats: null,
    reason,
  }
}

function publicRegistryFields(entry: RegistryAthlete): Omit<Athlete, 'performance'> {
  const { eligibility, image } = entry
  const participation = entry.participation.kind === 'team-affiliation'
    ? {
        kind: 'team-affiliation' as const,
        affiliation: {
          organization: entry.participation.affiliation.organization,
          competition: entry.participation.affiliation.competition,
          season: entry.participation.affiliation.season,
          rosterStatus: entry.participation.affiliation.rosterStatus,
          countsAsOverseas: true as const,
          source: entry.participation.affiliation.source,
          ...(entry.participation.affiliation.location === undefined
            ? {}
            : { location: entry.participation.affiliation.location }),
        },
      }
    : {
        kind: 'circuit-activity' as const,
        activity: {
          circuit: entry.participation.activity.circuit,
          discipline: entry.participation.activity.discipline,
          competition: entry.participation.activity.competition,
          season: entry.participation.activity.season,
          activityType: entry.participation.activity.activityType,
          effectiveAt: entry.participation.activity.effectiveAt,
          source: entry.participation.activity.source,
        },
      }
  return {
    id: entry.id,
    name: entry.name,
    aliases: entry.aliases,
    sport: entry.sport,
    ...(entry.discipline === undefined ? {} : { discipline: entry.discipline }),
    genderCategory: entry.genderCategory,
    tier: entry.tier,
    lifecycleStatus: entry.lifecycleStatus,
    visibility: 'public',
    eligibility: {
      basis: eligibility.basis,
      publisher: eligibility.publisher,
      sourceUrl: eligibility.sourceUrl,
      retrievedAt: eligibility.retrievedAt,
    },
    participation,
    ...(image === undefined
      ? {}
      : {
          image: {
            url: image.url,
            sourceUrl: image.sourceUrl,
            alt: image.alt,
            rightsStatus: 'approved' as const,
            rightsHolder: image.rightsHolder,
            license: image.license,
            usage: image.usage,
            retrievedAt: image.retrievedAt,
            ...(image.attribution === undefined ? {} : { attribution: image.attribution }),
          },
        }),
  }
}

function normalizeRecord(entry: RegistryAthlete, result: ProviderResult, now: Date): Athlete {
  const binding = entry.binding
  if (binding === undefined) {
    throw new Error(`Provider binding required for ${entry.id}`)
  }
  result = providerResultSchema.parse(result)
  const retrievedMilliseconds = new Date(result.retrievedAt).getTime()
  if (retrievedMilliseconds > now.getTime()) {
    throw new Error(`Provider observation cannot be in the future for ${entry.id}`)
  }
  if (result.stats !== null && !isObservationWithinRetention(result.retrievedAt, now)) {
    throw new Error(`Provider performance is outside the 48-hour retention window for ${entry.id}`)
  }
  if (result.athleteId !== entry.id) {
    throw new Error(
      `Provider identity mismatch: expected ${entry.id}, received ${result.athleteId}`,
    )
  }

  if (result.sport !== entry.sport || result.sport !== binding.sport ||
      result.competition !== participationCompetition(entry) ||
      result.competition !== binding.competition ||
      result.season !== binding.season) {
    throw new Error(`Provider context mismatch for ${entry.id}`)
  }

  if (
    entry.participation.kind === 'team-affiliation' &&
    result.observedOrganization !== undefined &&
    normalizeOrganization(result.observedOrganization) !==
      normalizeOrganization(entry.participation.affiliation.organization.name)
  ) {
    throw new Error(
      `Provider organization mismatch for ${entry.id}: expected ${entry.participation.affiliation.organization.name}, received ${result.observedOrganization}`,
    )
  }

  const source = {
    provider: binding.provider,
    sourceUrl: result.sourceUrl,
    retrievedAt: result.retrievedAt,
  }
  const performance: PublicPerformance =
    result.stats === null
      ? unavailablePerformance('not-integrated')
      : {
          status: 'available',
          state: result.state,
          competition: result.competition,
          season: result.season,
          stats: result.stats,
          source,
        }

  return { ...publicRegistryFields(entry), performance }
}

function staleRecord(
  entry: RegistryAthlete,
  previous: PreviousSnapshot,
  now: Date,
): Athlete {
  const binding = entry.binding
  const previousPerformance = previous.athletes.find(
    (athlete) => athlete.id === entry.id,
  )?.performance

  if (
    binding === undefined ||
    previousPerformance?.status !== 'available' ||
    previousPerformance.stats === null ||
    previousPerformance.stats.kind !== entry.sport ||
    previousPerformance.stats.kind !== binding.sport ||
    previousPerformance.source.provider !== binding.provider ||
    previousPerformance.competition !== binding.competition ||
    previousPerformance.competition !== participationCompetition(entry) ||
    previousPerformance.season !== binding.season ||
    !isObservationWithinRetention(previousPerformance.source.retrievedAt, now)
  ) {
    return {
      ...publicRegistryFields(entry),
      performance: unavailablePerformance('provider-unavailable'),
    }
  }

  return {
    ...publicRegistryFields(entry),
    performance: {
      ...previousPerformance,
      state: 'stale',
    },
  }
}

export async function buildSnapshot({
  entries,
  previous,
  coverage,
  fetchRecord,
  now,
}: BuildSnapshotOptions): Promise<AthleteSnapshot> {
  const settled = await Promise.allSettled(entries.map((entry) =>
    entry.binding === undefined ? Promise.resolve(null) : fetchRecord(entry)))
  const athletes = settled.map((result, index) => {
    const entry = entries[index]
    if (entry === undefined) throw new Error(`Missing registry entry at index ${index}`)
    if (entry.binding === undefined) {
      return {
        ...publicRegistryFields(entry),
        performance: unavailablePerformance('not-integrated'),
      }
    }
    if (result.status === 'rejected') {
      return staleRecord(entry, previous, now)
    }
    if (result.value === null) {
      throw new Error(`Missing provider result for ${entry.id}`)
    }
    return normalizeRecord(entry, result.value, now)
  })

  return snapshotSchema.parse({ generatedAt: now.toISOString(), athletes, coverage })
}
