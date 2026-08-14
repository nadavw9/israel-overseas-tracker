import { useEffect, useState } from 'react'
import { TrackerApp } from './app/App'
import { snapshotSchema, type AthleteSnapshot } from './domain/athlete'
import { refreshManifestSchema, type RefreshManifest } from './domain/refresh'

function App() {
  const [snapshot, setSnapshot] = useState<AthleteSnapshot | null>(null)
  const [refreshManifest, setRefreshManifest] = useState<RefreshManifest | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/data/snapshot.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => setSnapshot(snapshotSchema.parse(data)))
      .catch(() => setError(true))

    fetch('/data/refresh-manifest.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Refresh manifest HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => setRefreshManifest(refreshManifestSchema.parse(data)))
      .catch(() => setRefreshManifest(null))
  }, [])

  if (snapshot) return <TrackerApp snapshot={snapshot} refreshManifest={refreshManifest} />

  return (
    <main className="loading-shell">
      <p className="loading-shell__eyebrow">Verified data</p>
      <h1>Israel Overseas</h1>
      <p>{error ? 'The verified snapshot could not be loaded.' : 'Loading verified snapshot…'}</p>
    </main>
  )
}

export default App
