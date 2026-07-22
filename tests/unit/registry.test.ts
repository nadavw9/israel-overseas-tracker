import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { candidateQueueSchema } from '../../src/domain/registry'
import { publicRegistry } from '../../src/data/registry'

describe('registry compiler', () => {
  it('compiles the verified public athletes in source order', () => {
    expect(publicRegistry.map((athlete) => athlete.id)).toEqual([
      'deni-avdija',
      'ben-saraf',
      'oscar-gloukh',
    ])
    expect(publicRegistry.every((athlete) => athlete.eligibility.status === 'verified')).toBe(true)
    expect(publicRegistry.every((athlete) => athlete.affiliation.primary)).toBe(true)
  })

  it('includes only verified provider bindings', () => {
    expect(publicRegistry.map((athlete) => athlete.binding.externalId)).toEqual([
      '4683021',
      '5242502',
      'oscar-gloukh',
    ])
  })

  it('does not publish media without approved rights', () => {
    expect(publicRegistry.every((athlete) => athlete.image === undefined)).toBe(true)
  })
})

describe('candidate queue', () => {
  it('keeps unresolved candidates outside the public registry', () => {
    const candidates = candidateQueueSchema.parse(
      JSON.parse(readFileSync('data/review/candidates.json', 'utf8')),
    )

    expect(candidates.map((candidate) => candidate.id)).toEqual(['danny-wolf', 'zeev-buium'])
    expect(candidates.every((candidate) => candidate.state === 'needs-evidence')).toBe(true)
    expect(candidates.every((candidate) => !publicRegistry.some((athlete) => athlete.id === candidate.id))).toBe(true)
  })

  it('retains private discovery identifiers and lifecycle uncertainty', () => {
    const candidates = candidateQueueSchema.parse(
      JSON.parse(readFileSync('data/review/candidates.json', 'utf8')),
    )
    const danny = candidates.find((candidate) => candidate.id === 'danny-wolf')
    const zeev = candidates.find((candidate) => candidate.id === 'zeev-buium')

    expect(danny?.signals[0]?.note).toContain('espn-nba provider identity 5107173')
    expect(zeev?.signals[0]?.note).toContain('nhl provider identity 8484798')
    expect(danny?.signals[0]?.note).toContain('lifecycle status remains unknown')
    expect(zeev?.signals[0]?.note).toContain('lifecycle status remains unknown')
    expect(zeev?.name.he).toBe('זאב ביום')
  })
})
