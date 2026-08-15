import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { snapshotSchema } from '../src/domain/athlete'

const snapshotUrl = new URL('../public/data/snapshot.json', import.meta.url)
const manifestUrl = new URL('../public/images/athletes/manifest.json', import.meta.url)

export async function syncImageManifest() {
  const snapshot = snapshotSchema.parse(JSON.parse(await readFile(snapshotUrl, 'utf8')))
  const manifest = Object.fromEntries(
    snapshot.athletes.flatMap((athlete) => athlete.image ? [[athlete.id, athlete.image]] : []),
  )
  await mkdir(new URL('.', manifestUrl), { recursive: true })
  await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  syncImageManifest()
    .then((manifest) => console.log(`Wrote ${Object.keys(manifest).length} image manifest entries`))
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
