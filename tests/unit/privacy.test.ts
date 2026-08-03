import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const browserArtifactRoots = [
  'public',
  'src/app',
  'src/components',
  'src/i18n',
]
const browserArtifactEntries = [
  'index.html',
  'src/main.tsx',
  'src/App.tsx',
  'src/index.css',
  'src/domain/athlete.ts',
  'src/domain/coverage.ts',
  'src/domain/taxonomy.ts',
  'src/domain/observation.ts',
  'src/services/rankings.ts',
]

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(path) : [path]
  })
}

function browserArtifacts() {
  const files = [
    ...browserArtifactRoots.flatMap(collectFiles),
    ...browserArtifactEntries,
  ]
  return files.map((file) => ({
    file: relative('.', file).replace(/\\/g, '/'),
    content: readFileSync(file, 'utf8'),
  }))
}

function containsBirthDateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsBirthDateKey)
  if (value === null || typeof value !== 'object') return false

  return Object.entries(value).some(([key, child]) =>
    /^(?:birth[_-]?date|date[_-]?of[_-]?birth)$/i.test(key) || containsBirthDateKey(child),
  )
}

describe('privacy defaults', () => {
  it('does not contact a third-party font service on every page load', () => {
    const styles = [
      readFileSync('src/index.css', 'utf8'),
      readFileSync('src/app/styles.css', 'utf8'),
    ].join('\n')

    expect(styles).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i)
  })

  it('keeps review identifiers and full birth dates out of browser artifacts', () => {
    const artifacts = browserArtifacts()
    const scannedFiles = artifacts.map(({ file }) => file)
    const content = artifacts.map(({ content }) => content).join('\n')
    const snapshot = JSON.parse(readFileSync('public/data/snapshot.json', 'utf8')) as unknown

    expect(scannedFiles.length).toBeGreaterThan(20)
    expect(scannedFiles).toContain('public/data/snapshot.json')
    expect(scannedFiles).toContain('src/main.tsx')
    expect(scannedFiles).toContain('src/app/App.tsx')
    expect(scannedFiles).toContain('src/components/AthleteDrawer.tsx')
    expect(content).not.toMatch(/danny-wolf|zeev-buium|reviewerNote/i)
    expect(containsBirthDateKey(snapshot)).toBe(false)
    expect(content).not.toMatch(/(?:["'](?:birth[_-]?date|date[_-]?of[_-]?birth)["']|\b(?:birth[_-]?date|date[_-]?of[_-]?birth)\b)\s*:/i)
  })
})
