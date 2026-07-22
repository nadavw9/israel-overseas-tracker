import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { candidateQueueSchema } from '../../src/domain/registry'
import { compileRegistryBundle, publicRegistry } from '../../src/data/registry'
import { registryBundleFixture } from '../fixtures/registry'

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
    expect(candidates.every((candidate) => candidate.signals.some((signal) => signal.note.includes('pending represents-israel')))).toBe(true)
    expect(zeev?.name.he).toBe('זאב ביום')
    expect(danny?.location).toEqual({ city: 'Brooklyn', country: 'United States', lat: 40.6782, lng: -73.9442 })
    expect(zeev?.location).toEqual({ city: 'Vancouver', country: 'Canada', lat: 49.2827, lng: -123.1207 })
  })
})

describe('injectable registry compiler', () => {
  it('compiles a recent free agent using its released affiliation', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.athletes[0].lifecycleStatus = 'free-agent'
    bundle.affiliations[0].competition = 'NBA'
    bundle.affiliations[0].rosterStatus = 'released'
    bundle.affiliations[0].endDate = '2026-07-01'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'

    expect(compileRegistryBundle(bundle, '2026-07-23')[0]?.affiliation.rosterStatus).toBe('released')
  })

  it('selects the newest evidence, matching binding, and approved media deterministically', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.evidence[0].retrievedAt = '2026-07-23T07:00:00.000Z'
    bundle.providerBindings[0].verifiedAt = '2026-07-23T07:00:00.000Z'
    bundle.media[0].retrievedAt = '2026-07-23T07:00:00.000Z'
    bundle.evidence.push({ ...bundle.evidence[0], id: 'evidence-new', retrievedAt: '2026-07-23T08:00:00.000Z' })
    bundle.providerBindings.push({ ...bundle.providerBindings[0], id: 'binding-new', externalId: 'new', verifiedAt: '2026-07-23T08:00:00.000Z' })
    bundle.media.push({ ...bundle.media[0], id: 'media-new', retrievedAt: '2026-07-23T08:00:00.000Z' })

    const athlete = compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]
    expect(athlete?.eligibility.id).toBe('evidence-new')
    expect(athlete?.binding.id).toBe('binding-new')
    expect(athlete?.image?.id).toBe('media-new')
  })

  it('rejects future provenance and mismatched binding competitions', () => {
    const future = structuredClone(registryBundleFixture)
    future.athletes[0].sport = 'basketball'
    future.affiliations[0].competition = 'NBA'
    future.providerBindings[0].provider = 'espn-nba'
    future.providerBindings[0].sport = 'basketball'
    future.providerBindings[0].competition = 'NBA'
    future.evidence[0].retrievedAt = '2026-07-24T08:00:00.000Z'
    future.providerBindings[0].verifiedAt = '2026-07-24T08:00:00.000Z'

    expect(() => compileRegistryBundle(future, '2026-07-23T08:00:00.000Z')).toThrow(/verified eligibility/i)

    const mismatch = structuredClone(future)
    mismatch.evidence[0].retrievedAt = '2026-07-23T08:00:00.000Z'
    mismatch.providerBindings[0].verifiedAt = '2026-07-23T08:00:00.000Z'
    mismatch.providerBindings[0].competition = 'EuroLeague'
    expect(() => compileRegistryBundle(mismatch, '2026-07-23T08:00:00.000Z')).toThrow(/binding/i)
  })

  it('treats equivalent instants equally and rejects fractional-second future provenance', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.evidence[0].retrievedAt = '2026-07-23T08:00:00Z'
    bundle.providerBindings[0].verifiedAt = '2026-07-23T08:00:00Z'
    bundle.affiliations[0].source.retrievedAt = '2026-07-23T08:00:00Z'

    expect(compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')).toHaveLength(1)
    bundle.evidence[0].retrievedAt = '2026-07-23T08:00:00.500Z'
    expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00Z')).toThrow(/eligibility/i)
  })

  it('rejects a future-sourced affiliation', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.affiliations[0].source.retrievedAt = '2026-07-23T08:00:00.500Z'

    expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00Z')).toThrow(/affiliation/i)
  })
})
