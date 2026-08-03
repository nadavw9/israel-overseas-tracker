import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { httpsUrlSchema } from '../src/domain/athlete'
import { mediaLicenseSchema, mediaRightsStatusSchema, mediaUsageSchema } from '../src/domain/registry'

const athleteIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: 'Manifest athlete ID must be a slug',
})

const imageSchema = z.object({
  url: httpsUrlSchema,
  sourceUrl: httpsUrlSchema,
  alt: z.string().trim().min(1),
  rightsStatus: mediaRightsStatusSchema,
  rightsHolder: z.string().trim().min(1).optional(),
  license: mediaLicenseSchema.optional(),
  attribution: z.string().trim().min(1).optional(),
  usage: mediaUsageSchema,
  retrievedAt: z.iso.datetime(),
}).strict().superRefine((image, context) => {
  if (image.rightsStatus !== 'approved') return
  if (!image.rightsHolder) {
    context.addIssue({ code: 'custom', message: 'Approved image requires a rights holder', path: ['rightsHolder'] })
  }
  if (!image.license) {
    context.addIssue({ code: 'custom', message: 'Approved image requires a license', path: ['license'] })
  }
})

const manifestSchema = z.record(athleteIdSchema, imageSchema)
export type ImageManifest = z.infer<typeof manifestSchema>

export async function validateImages(
  input: unknown,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const manifest = manifestSchema.parse(input)
  const seen = new Set<string>()

  for (const [athleteId, image] of Object.entries(manifest)) {
    if (image.rightsStatus !== 'approved') continue

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
