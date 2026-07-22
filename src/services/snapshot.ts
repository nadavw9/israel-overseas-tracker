import type { ProviderResult } from '../../scripts/providers/types'
import type { RegistryAthlete } from '../data/registry'
import {
  snapshotSchema,
  type Athlete,
  type AthleteSnapshot,
  type PublicPerformance,
} from '../domain/athlete'
import type { CoverageSummary } from '../domain/coverage'

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

function publicRegistryFields(entry: RegistryAthlete): Omit<Athlete, 'performance'> {
  const { eligibility, affiliation, image } = entry
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
    affiliation: {
      organization: affiliation.organization,
      competition: affiliation.competition,
      season: affiliation.season,
      rosterStatus: affiliation.rosterStatus,
      countsAsOverseas: true,
      source: affiliation.source,
      ...(affiliation.location === undefined ? {} : { location: affiliation.location }),
    },
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

function normalizeRecord(entry: RegistryAthlete, result: ProviderResult): Athlete {
  if (result.athleteId !== entry.id) {
    throw new Error(
      `Provider identity mismatch: expected ${entry.id}, received ${result.athleteId}`,
    )
  }

  if (
    result.observedOrganization !== undefined &&
    normalizeOrganization(result.observedOrganization) !==
      normalizeOrganization(entry.affiliation.organization.name)
  ) {
    throw new Error(
      `Provider organization mismatch for ${entry.id}: expected ${entry.affiliation.organization.name}, received ${result.observedOrganization}`,
    )
  }

  const source = {
    provider: entry.binding.provider,
    sourceUrl: result.sourceUrl,
    retrievedAt: result.retrievedAt,
  }
  const performance: PublicPerformance =
    result.stats === null
      ? {
          status: 'unavailable',
          state: 'unavailable',
          competition: entry.affiliation.competition,
          season: entry.affiliation.season,
          stats: null,
          source,
        }
      : {
          status: 'available',
          state: result.state,
          competition: entry.affiliation.competition,
          season: entry.affiliation.season,
          stats: result.stats,
          source,
        }

  return { ...publicRegistryFields(entry), performance }
}

function staleRecord(
  entry: RegistryAthlete,
  previous: PreviousSnapshot,
  reason: unknown,
): Athlete {
  const previousPerformance = previous.athletes.find(
    (athlete) => athlete.id === entry.id,
  )?.performance

  if (
    previousPerformance?.status !== 'available' ||
    previousPerformance.stats === null
  ) {
    const message = reason instanceof Error ? reason.message : String(reason)
    throw new Error(`No verified data available for ${entry.id}: ${message}`)
  }

  return {
    ...publicRegistryFields(entry),
    performance: {
      ...previousPerformance,
      competition: entry.affiliation.competition,
      season: entry.affiliation.season,
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
  const settled = await Promise.allSettled(entries.map(fetchRecord))
  const athletes = settled.map((result, index) => {
    const entry = entries[index]
    if (entry === undefined) throw new Error(`Missing registry entry at index ${index}`)
    return result.status === 'fulfilled'
      ? normalizeRecord(entry, result.value)
      : staleRecord(entry, previous, result.reason)
  })

  return snapshotSchema.parse({ generatedAt: now.toISOString(), athletes, coverage })
}
