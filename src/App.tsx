import { useEffect, useState } from 'react'
import { TrackerApp } from './app/App'
import { snapshotSchema, type AthleteSnapshot } from './domain/athlete'

function App() {
  const [snapshot, setSnapshot] = useState<AthleteSnapshot | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/data/snapshot.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => setSnapshot(snapshotSchema.parse(data)))
      .catch(() => setError(true))
  }, [])

  if (snapshot) return <TrackerApp snapshot={snapshot} />

  return (
    <main className="loading-shell">
      <p className="loading-shell__eyebrow">Verified data</p>
      <h1>Israel Overseas</h1>
      <p>{error ? 'The verified snapshot could not be loaded.' : 'Loading verified snapshot…'}</p>
    </main>
  )
}

export default App
