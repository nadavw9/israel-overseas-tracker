import { describe, expect, it } from 'vitest'
import { publicRegistry, reviewRegistry } from '../../src/data/registry'

describe('athlete registry inclusion policy', () => {
  it('publishes only athletes with verified Israeli eligibility', () => {
    expect(publicRegistry.map((athlete) => athlete.id)).toEqual([
      'deni-avdija',
      'ben-saraf',
      'oscar-gloukh',
    ])
    expect(
      publicRegistry.every(
        (athlete) => athlete.eligibility.status === 'verified',
      ),
    ).toBe(true)
  })

  it('keeps unresolved eligibility records out of public data', () => {
    expect(reviewRegistry.map((athlete) => athlete.id)).toEqual([
      'danny-wolf',
      'zeev-buium',
    ])
  })
})
