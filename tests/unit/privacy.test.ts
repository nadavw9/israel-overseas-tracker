import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'

type ReviewCandidate = { id: string; reviewerNote: string }
type Artifact = { file: string; content: string }

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(path) : [path]
  })
}

function emittedArtifacts(directory: string): Artifact[] {
  return collectFiles(directory).map((file) => ({
    file: relative(directory, file).replace(/\\/g, '/'),
    content: readFileSync(file, 'utf8'),
  }))
}

function reviewCandidates(): ReviewCandidate[] {
  const candidates = JSON.parse(readFileSync('data/review/candidates.json', 'utf8')) as unknown
  if (!Array.isArray(candidates)) throw new Error('Review candidates must be an array')

  return candidates.map((candidate) => {
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      typeof candidate.id !== 'string' ||
      typeof candidate.reviewerNote !== 'string'
    ) {
      throw new Error('Review candidate must have an id and reviewer note')
    }
    return candidate as ReviewCandidate
  })
}

function containsBirthDateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsBirthDateKey)
  if (value === null || typeof value !== 'object') return false

  return Object.entries(value).some(([key, child]) =>
    /^(?:birth[_-]?date|date[_-]?of[_-]?birth)$/i.test(key) || containsBirthDateKey(child),
  )
}

function assertNoPrivateContent(artifacts: Artifact[], candidates: ReviewCandidate[]) {
  const content = artifacts.map(({ content: artifactContent }) => artifactContent).join('\n').toLocaleLowerCase()
  const birthDateField = /(?:["'](?:birth[_-]?date|date[_-]?of[_-]?birth)["']|\b(?:birth[_-]?date|date[_-]?of[_-]?birth)\b)\s*:/i

  for (const candidate of candidates) {
    if (content.includes(candidate.id.toLocaleLowerCase())) throw new Error(`Leaked private candidate id: ${candidate.id}`)
    if (content.includes(candidate.reviewerNote.toLocaleLowerCase())) throw new Error(`Leaked private reviewer note for: ${candidate.id}`)
  }
  if (content.includes('reviewernote')) throw new Error('Leaked private reviewer-note field')
  if (birthDateField.test(content)) throw new Error('Leaked full birth-date field')
}

describe('privacy defaults', () => {
  it('does not contact a third-party font service on every page load', () => {
    const styles = [
      readFileSync('src/index.css', 'utf8'),
      readFileSync('src/app/styles.css', 'utf8'),
    ].join('\n')

    expect(styles).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i)
  })

  it('rejects a synthetic emitted private-candidate leak', () => {
    const candidates = reviewCandidates()
    expect(candidates).not.toHaveLength(0)
    expect(candidates.map(({ id }) => id)).toEqual(expect.arrayContaining(['danny-wolf', 'zeev-buium']))
    expect(candidates.every(({ reviewerNote }) => reviewerNote.trim().length > 0)).toBe(true)

    expect(() => assertNoPrivateContent([
      { file: 'assets/leak.js', content: `const candidate = '${candidates[0]?.id}'` },
    ], candidates)).toThrow(/Leaked private candidate id/)
    expect(() => assertNoPrivateContent([
      { file: 'assets/leak.js', content: `const note = '${candidates[0]?.reviewerNote}'` },
    ], candidates)).toThrow(/Leaked private reviewer note/)
    expect(() => assertNoPrivateContent([
      { file: 'assets/leak.js', content: 'const record = { reviewerNote: "private" }' },
    ], candidates)).toThrow(/Leaked private reviewer-note field/)
    expect(() => assertNoPrivateContent([
      { file: 'assets/leak.js', content: 'const record = { birthDate: "2000-01-01" }' },
    ], candidates)).toThrow(/Leaked full birth-date field/)
  })

  it('keeps review data and full birth dates out of every Vite artifact', async () => {
    const candidates = reviewCandidates()
    const snapshot = JSON.parse(readFileSync('public/data/snapshot.json', 'utf8')) as unknown
    const outputDirectory = mkdtempSync(join(tmpdir(), 'israel-overseas-privacy-'))

    try {
      await build({
        logLevel: 'silent',
        build: { outDir: outputDirectory, emptyOutDir: true },
      })
      const artifacts = emittedArtifacts(outputDirectory)
      const files = artifacts.map(({ file }) => file)

      expect(files.length).toBeGreaterThan(5)
      expect(files).toContain('index.html')
      expect(files).toContain('data/snapshot.json')
      expect(files.some((file) => /^assets\/.*\.js$/.test(file))).toBe(true)
      expect(containsBirthDateKey(snapshot)).toBe(false)
      assertNoPrivateContent(artifacts, candidates)
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true })
    }
  })
})
