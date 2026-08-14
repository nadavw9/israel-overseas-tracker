import { pathToFileURL } from 'node:url'
import { runPerformanceRefresh } from './sync-data'

export { runPerformanceRefresh }

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  runPerformanceRefresh()
    .then(({ snapshot, manifest }) => {
      const providerSummary = manifest.providers
        .map((provider) => `${provider.provider}:${provider.succeeded}/${provider.attempted}`)
        .join(', ')
      console.log(
        `Refreshed ${snapshot.athletes.length} athletes at ${snapshot.generatedAt}; ${providerSummary || 'no bound providers'}; unbound:${manifest.unboundSkipped}`,
      )
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
