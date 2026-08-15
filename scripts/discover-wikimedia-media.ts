import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { loadLocalEnv } from './load-env'

type Athlete = {
  id: string
  name: { en: string }
  aliases: string[]
}

type CommonsMetadata = Record<string, { value?: string } | undefined>

type CommonsPage = {
  title?: string
  imageinfo?: Array<{
    mime?: string
    width?: number
    height?: number
    thumburl?: string
    descriptionurl?: string
    extmetadata?: CommonsMetadata
  }>
}

type CommonsCandidate = {
  title: string
  pageUrl: string | null
  imageUrl: string | null
  mime: string | null
  width: number | null
  height: number | null
  license: string | null
  licenseUrl: string | null
  artist: string | null
  description: string | null
  score: number
}

export type WikimediaMediaRecord = {
  athleteId: string
  athleteName: string
  query: string
  status: 'candidate' | 'not-found' | 'error'
  candidate: CommonsCandidate | null
  rightsStatus: 'review'
  note: string
}

const delayMs = Number(process.env.WIKIMEDIA_DELAY_MS ?? 2_000)

function metadataValue(metadata: CommonsMetadata | undefined, key: string) {
  return metadata?.[key]?.value?.trim() || null
}

function stripMarkup(value: string | null) {
  return value?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(value: string) {
  return normalize(value).split(' ').filter((token) => token.length > 1)
}

function containsAllTokens(value: string, wanted: string[]) {
  const haystack = ` ${normalize(value)} `
  return wanted.every((token) => haystack.includes(` ${token} `))
}

function normalizeLicense(shortName: string | null, license: string | null, usageTerms: string | null) {
  const value = normalize([shortName, license, usageTerms].filter(Boolean).join(' '))
  if (value.includes('public domain') || value.includes('cc0')) return 'public-domain'
  if (value.includes('cc by sa') || value.includes('creative commons attribution share alike')) return 'cc-by-sa'
  if (value.includes('cc by') || value.includes('creative commons attribution')) return 'cc-by'
  return null
}

function candidateFromPage(page: CommonsPage, wanted: string[]): CommonsCandidate | null {
  const info = page.imageinfo?.[0]
  if (!info || info.mime === undefined || !info.mime.startsWith('image/')) return null
  const metadata = info.extmetadata
  const title = page.title ?? ''
  const categories = metadataValue(metadata, 'Categories') ?? ''
  const description = metadataValue(metadata, 'ImageDescription') ?? ''
  const titleMatch = containsAllTokens(title.replace(/^File:/i, ''), wanted)
  const contextMatch = containsAllTokens(`${categories} ${description}`, wanted)
  const license = normalizeLicense(
    metadataValue(metadata, 'LicenseShortName'),
    metadataValue(metadata, 'License'),
    metadataValue(metadata, 'UsageTerms'),
  )
  if (!license || (!titleMatch && !contextMatch)) return null
  const portraitSignal = /portrait|headshot|player|athlete|match|game|basketball|soccer|football|tennis/i.test(`${title} ${categories} ${description}`)
  return {
    title,
    pageUrl: info.descriptionurl ?? null,
    imageUrl: info.thumburl ?? null,
    mime: info.mime,
    width: info.width ?? null,
    height: info.height ?? null,
    license,
    licenseUrl: metadataValue(metadata, 'LicenseUrl'),
    artist: stripMarkup(metadataValue(metadata, 'Artist')),
    description: stripMarkup(description),
    score: (titleMatch ? 100 : 60) + (contextMatch ? 20 : 0) + (portraitSignal ? 10 : 0),
  }
}

async function fetchCandidates(query: string, attempt = 0): Promise<CommonsCandidate[]> {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
    `&gsrsearch=${encodeURIComponent(`"${query}"`)}&gsrnamespace=6&gsrlimit=20` +
    '&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=800&format=json&origin=*'
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'IsraelOverseasTracker/1.0 (Wikimedia Commons media audit)',
    },
  })
  if (response.status === 429 || response.status === 503) {
    if (attempt >= 3) throw new Error(`Wikimedia Commons HTTP ${response.status}`)
    const retryAfter = Number(response.headers.get('retry-after') ?? 0)
    await new Promise((resolve) => setTimeout(resolve, Math.max(3_000, retryAfter * 1_000)))
    return fetchCandidates(query, attempt + 1)
  }
  if (!response.ok) throw new Error(`Wikimedia Commons HTTP ${response.status}`)
  const payload = await response.json() as { query?: { pages?: Record<string, CommonsPage> } }
  const wanted = tokens(query)
  return Object.values(payload.query?.pages ?? {})
    .map((page) => candidateFromPage(page, wanted))
    .filter((candidate): candidate is CommonsCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score || (right.width ?? 0) - (left.width ?? 0))
}

export async function discoverWikimediaMedia(athletes: Athlete[]) {
  const records: WikimediaMediaRecord[] = []
  for (const athlete of athletes) {
    const query = athlete.name.en
    try {
      const candidate = (await fetchCandidates(query))[0] ?? null
      records.push({
        athleteId: athlete.id,
        athleteName: athlete.name.en,
        query,
        status: candidate === null ? 'not-found' : 'candidate',
        candidate,
        rightsStatus: 'review',
        note: candidate === null
          ? 'No exact-name, image, and approved-license candidate was found.'
          : 'Candidate has a Commons license signal; verify the person, attribution, and intended display before approval.',
      })
    } catch (error) {
      records.push({
        athleteId: athlete.id,
        athleteName: athlete.name.en,
        query,
        status: 'error',
        candidate: null,
        rightsStatus: 'review',
        note: error instanceof Error ? error.message : String(error),
      })
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return {
    checkedAt: new Date().toISOString(),
    provider: 'Wikimedia Commons',
    rightsNote: 'Candidates remain review-only until identity, license, attribution, and display terms are approved.',
    summary: {
      athletes: records.length,
      candidates: records.filter((record) => record.status === 'candidate').length,
      notFound: records.filter((record) => record.status === 'not-found').length,
      errors: records.filter((record) => record.status === 'error').length,
      ccBy: records.filter((record) => record.candidate?.license === 'cc-by').length,
      ccBySa: records.filter((record) => record.candidate?.license === 'cc-by-sa').length,
      publicDomain: records.filter((record) => record.candidate?.license === 'public-domain').length,
    },
    records,
  }
}

async function run() {
  loadLocalEnv()
  const athletes = JSON.parse(await readFile('data/registry/athletes.json', 'utf8')) as Athlete[]
  const report = await discoverWikimediaMedia(athletes)
  await mkdir('data/review', { recursive: true })
  await writeFile('data/review/wikimedia-media-audit.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report.summary, null, 2))
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
