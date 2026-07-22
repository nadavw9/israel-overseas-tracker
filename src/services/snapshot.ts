import type { ProviderResult } from '../../scripts/providers/types'
import type { RegistryAthlete } from '../data/registry'
import {
  snapshotSchema,
  type Athlete,
  type AthleteSnapshot,
} from '../domain/athlete'

type BuildSnapshotOptions = {
  entries: RegistryAthlete[]
  previous: AthleteSnapshot
  fetchRecord: (entry: RegistryAthlete) => Promise<ProviderResult>
  now: Date
}

function normalizeRecord(
  entry: RegistryAthlete,
  result: ProviderResult,
): Athlete {
  if (result.athleteId !== entry.id) {
    throw new Error(
      `Provider identity mismatch: expected ${entry.id}, received ${result.athleteId}`,
    )
  }

  const hasStats = result.stats !== null

  return {
    id: entry.id,
    name: entry.name,
    sport: entry.sport,
    competition: entry.competition,
    team: result.team ?? entry.team,
    eligibility: entry.eligibility,
    visibility: 'public',
    season: entry.season,
    statsStatus: hasStats ? 'verified' : 'unavailable',
    stats: result.stats,
    source: {
      provider: entry.provider,
      sourceUrl: result.sourceUrl,
      retrievedAt: result.retrievedAt,
    },
    freshness: hasStats ? 'fresh' : 'identity-only',
    location: entry.location,
    ...(entry.image === undefined ? {} : { image: entry.image }),
  }
}

export async function buildSnapshot({
  entries,
  previous,
  fetchRecord,
  now,
}: BuildSnapshotOptions): Promise<AthleteSnapshot> {
  const settled = await Promise.allSettled(entries.map(fetchRecord))

  const athletes = settled.map((result, index) => {
    const entry = entries[index]

    if (result.status === 'fulfilled') {
      return normalizeRecord(entry, result.value)
    }

    const previousRecord = previous.athletes.find(
      (athlete) => athlete.id === entry.id,
    )

    if (!previousRecord) {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason)
      throw new Error(`No verified data available for ${entry.id}: ${reason}`)
    }

    const { image: _, ...previousWithoutImage } = previousRecord
    return {
      ...previousWithoutImage,
      ...(entry.image === undefined ? {} : { image: entry.image }),
      freshness: 'stale' as const,
    }
  })

  return snapshotSchema.parse({ generatedAt: now.toISOString(), athletes })
}
