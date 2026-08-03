import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { httpsUrlSchema, publicMediaSchema, snapshotSchema } from '../src/domain/athlete'

const athleteIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: 'Manifest athlete ID must be a slug',
})

const manifestSchema = z.record(athleteIdSchema, publicMediaSchema)
export type ImageManifest = z.infer<typeof manifestSchema>

type ValidationOptions = { timeoutMs?: number }
const defaultTimeoutMs = 10_000

function cancelResponseBody(response: Response | undefined) {
  const cancellation = response?.body?.cancel?.()
  if (cancellation) void cancellation.catch(() => {})
}

function parseManifest(input: unknown): ImageManifest {
  const parsedManifest = manifestSchema.safeParse(input)
  if (!parsedManifest.success) {
    const missingRightsHolder = parsedManifest.error.issues.some(
      (issue) => issue.path.at(-1) === 'rightsHolder' && issue.code === 'invalid_type',
    )
    if (missingRightsHolder) throw new Error('Approved image requires a rights holder')
    throw parsedManifest.error
  }
  return parsedManifest.data
}

export function assertImageManifestMatchesSnapshot(
  snapshotInput: unknown,
  manifestInput: unknown,
): ImageManifest {
  const snapshot = snapshotSchema.parse(snapshotInput)
  const manifest = parseManifest(manifestInput)
  const expected = Object.fromEntries(
    snapshot.athletes.flatMap((athlete) => athlete.image ? [[athlete.id, athlete.image]] : []),
  ) as ImageManifest

  for (const athleteId of Object.keys(expected)) {
    if (manifest[athleteId] === undefined) {
      throw new Error(`Snapshot image missing from manifest for ${athleteId}`)
    }
  }
  for (const athleteId of Object.keys(manifest)) {
    if (expected[athleteId] === undefined) {
      throw new Error(`Orphan manifest image not present in snapshot for ${athleteId}`)
    }
    if (JSON.stringify(manifest[athleteId]) !== JSON.stringify(expected[athleteId])) {
      throw new Error(`Manifest image metadata mismatch for ${athleteId}`)
    }
  }

  return manifest
}

export async function validateImages(
  input: unknown,
  fetcher: typeof fetch = fetch,
  { timeoutMs = defaultTimeoutMs }: ValidationOptions = {},
): Promise<number> {
  const manifest = parseManifest(input)
  const seen = new Set<string>()

  for (const [athleteId, image] of Object.entries(manifest)) {
    if (seen.has(image.url)) {
      throw new Error(`Duplicate image URL for ${athleteId}`)
    }
    seen.add(image.url)

    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    let response: Response | undefined
    let timedOut = false
    const timeoutError = new Error(`Image check timed out for ${athleteId}`)
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true
          reject(timeoutError)
          controller.abort()
        }, timeoutMs)
      })
      const fetchPromise = fetcher(image.url, {
        headers: { Range: 'bytes=0-1024' },
        signal: controller.signal,
      })
      fetchPromise.then(
        (lateResponse) => {
          if (timedOut) cancelResponseBody(lateResponse)
        },
        () => {},
      )
      try {
        response = await Promise.race([fetchPromise, timeoutPromise])
      } catch (error) {
        if (timedOut) throw timeoutError
        throw error
      }
      if (response.url && !httpsUrlSchema.safeParse(response.url).success) {
        throw new Error(`Image check failed for ${athleteId}: final URL must be HTTPS`)
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!response.ok || !contentType.startsWith('image/')) {
        throw new Error(
          `Image check failed for ${athleteId}: HTTP ${response.status} ${contentType}`,
        )
      }
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      cancelResponseBody(response)
    }
  }

  return seen.size
}

async function run() {
  const snapshotUrl = new URL('../public/data/snapshot.json', import.meta.url)
  const manifestUrl = new URL(
    '../public/images/athletes/manifest.json',
    import.meta.url,
  )
  const [snapshot, manifest] = await Promise.all([
    readFile(snapshotUrl, 'utf8').then((contents) => JSON.parse(contents)),
    readFile(manifestUrl, 'utf8').then((contents) => JSON.parse(contents)),
  ])
  const boundManifest = assertImageManifestMatchesSnapshot(snapshot, manifest)
  const count = await validateImages(boundManifest)
  console.log(`Validated ${count} athlete images`)
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
