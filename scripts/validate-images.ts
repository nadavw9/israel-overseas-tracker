import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

const imageSchema = z.object({
  url: z.url(),
  sourceUrl: z.url(),
  alt: z.string().trim().min(1),
})

const manifestSchema = z.record(z.string(), imageSchema)
export type ImageManifest = z.infer<typeof manifestSchema>

export async function validateImages(
  input: unknown,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const manifest = manifestSchema.parse(input)
  const seen = new Set<string>()

  for (const [athleteId, image] of Object.entries(manifest)) {
    if (seen.has(image.url)) {
      throw new Error(`Duplicate image URL for ${athleteId}`)
    }
    seen.add(image.url)

    const response = await fetcher(image.url, {
      headers: { Range: 'bytes=0-1024' },
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.startsWith('image/')) {
      throw new Error(
        `Image check failed for ${athleteId}: HTTP ${response.status} ${contentType}`,
      )
    }
  }

  return Object.keys(manifest).length
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
