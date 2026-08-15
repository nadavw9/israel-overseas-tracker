import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { loadLocalEnv } from './load-env'

type Athlete = {
  id: string
  name: { en: string }
  aliases: string[]
}

type TheSportsDbPlayer = {
  idPlayer?: string
  strPlayer?: string
  strTeam?: string
  strSport?: string
  strNationality?: string
  strThumb?: string | null
  strCutout?: string | null
  strStatus?: string | null
}

export type MediaDiscoveryRecord = {
  athleteId: string
  athleteName: string
  query: string
  status: 'found' | 'found-no-image' | 'not-found' | 'error'
  source: 'thesportsdb'
  sourceUrl: string | null
  playerId: string | null
  matchedName: string | null
  team: string | null
  sport: string | null
  nationality: string | null
  imageUrl: string | null
  imageKind: 'thumb' | 'cutout' | null
  rightsStatus: 'review'
  detail?: string
}

function getApiKey() {
  return process.env.THESPORTSDB_API_KEY ?? '123'
}

function getDelayMs() {
  return Number(process.env.THESPORTSDB_DELAY_MS ?? 2_100)
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isNameMatch(query: string, candidate: TheSportsDbPlayer) {
  const wanted = normalize(query)
  const actual = normalize(candidate.strPlayer ?? '')
  if (!wanted || !actual) return false
  return actual === wanted || actual.includes(wanted) || wanted.includes(actual)
}

async function search(query: string): Promise<TheSportsDbPlayer[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(getApiKey())}/searchplayers.php?p=${encodeURIComponent(query)}`
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'israel-overseas-tracker-media-discovery/1.0' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = await response.json() as { player?: TheSportsDbPlayer[] | null }
  return payload.player ?? []
}

function toRecord(athlete: Athlete, query: string, player: TheSportsDbPlayer | undefined): MediaDiscoveryRecord {
  if (!player) {
    return {
      athleteId: athlete.id,
      athleteName: athlete.name.en,
      query,
      status: 'not-found',
      source: 'thesportsdb',
      sourceUrl: null,
      playerId: null,
      matchedName: null,
      team: null,
      sport: null,
      nationality: null,
      imageUrl: null,
      imageKind: null,
      rightsStatus: 'review',
    }
  }
  const imageKind = player.strThumb ? 'thumb' : player.strCutout ? 'cutout' : null
  return {
    athleteId: athlete.id,
    athleteName: athlete.name.en,
    query,
    status: imageKind ? 'found' : 'found-no-image',
    source: 'thesportsdb',
    sourceUrl: player.idPlayer ? `https://www.thesportsdb.com/player/${player.idPlayer}` : null,
    playerId: player.idPlayer ?? null,
    matchedName: player.strPlayer ?? null,
    team: player.strTeam ?? null,
    sport: player.strSport ?? null,
    nationality: player.strNationality ?? null,
    imageUrl: player.strThumb ?? player.strCutout ?? null,
    imageKind,
    rightsStatus: 'review',
  }
}

export async function discoverMedia(athletes: Athlete[]) {
  const records: MediaDiscoveryRecord[] = []
  for (const athlete of athletes) {
    const queries = [athlete.name.en, ...athlete.aliases]
    let result: MediaDiscoveryRecord | undefined
    for (const query of queries) {
      try {
        const players = await search(query)
        const israel = players.find((player) =>
          isNameMatch(query, player) && normalize(player.strNationality ?? '').includes('israel'),
        )
        const fallback = players.find((player) => isNameMatch(query, player))
        result = toRecord(athlete, query, israel ?? fallback)
        if (result.status !== 'not-found' || query === queries.at(-1)) break
      } catch (error) {
        result = {
          athleteId: athlete.id,
          athleteName: athlete.name.en,
          query,
          status: 'error',
          source: 'thesportsdb',
          sourceUrl: null,
          playerId: null,
          matchedName: null,
          team: null,
          sport: null,
          nationality: null,
          imageUrl: null,
          imageKind: null,
          rightsStatus: 'review',
          detail: error instanceof Error ? error.message : String(error),
        }
        break
      }
      await new Promise((resolve) => setTimeout(resolve, getDelayMs()))
    }
    records.push(result ?? toRecord(athlete, athlete.name.en, undefined))
    await new Promise((resolve) => setTimeout(resolve, getDelayMs()))
  }
  return {
    checkedAt: new Date().toISOString(),
    provider: 'TheSportsDB',
    rightsNote: 'All candidates remain review-only. Do not publish or mirror an image until reuse rights and attribution are approved.',
    summary: {
      athletes: records.length,
      found: records.filter((record) => record.status === 'found').length,
      foundNoImage: records.filter((record) => record.status === 'found-no-image').length,
      notFound: records.filter((record) => record.status === 'not-found').length,
      errors: records.filter((record) => record.status === 'error').length,
    },
    records,
  }
}

async function run() {
  loadLocalEnv()
  const athletes = JSON.parse(await readFile('data/registry/athletes.json', 'utf8')) as Athlete[]
  const report = await discoverMedia(athletes)
  await mkdir('data/review', { recursive: true })
  await writeFile('data/review/media-source-audit.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report.summary, null, 2))
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
