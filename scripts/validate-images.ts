import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { httpsUrlSchema, publicMediaSchema } from '../src/domain/athlete'

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

export async function validateImages(
  input: unknown,
  fetcher: typeof fetch = fetch,
  { timeoutMs = defaultTimeoutMs }: ValidationOptions = {},
): Promise<number> {
  const parsedManifest = manifestSchema.safeParse(input)
  if (!parsedManifest.success) {
    const missingRightsHolder = parsedManifest.error.issues.some(
      (issue) => issue.path.at(-1) === 'rightsHolder' && issue.code === 'invalid_type',
    )
    if (missingRightsHolder) throw new Error('Approved image requires a rights holder')
    throw parsedManifest.error
  }
  const manifest = parsedManifest.data
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
  const manifestUrl = new URL(
    '../public/images/athletes/manifest.json',
    import.meta.url,
  )
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
  const count = await validateImages(manifest)
  console.log(`Validated ${count} athlete images`)
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
