import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AthletePhoto } from '../../src/components/AthletePhoto'
import { publicRegistry } from '../../src/data/registry'
import type { Athlete } from '../../src/domain/athlete'
import { validateImages } from '../../scripts/validate-images'

describe('athlete imagery', () => {
  it('omits media assets that do not have approved reuse rights', () => {
    expect(publicRegistry.every((athlete) => athlete.image === undefined)).toBe(true)
  })

  it('renders an accessible fallback when a record has no image', () => {
    const athlete = {
      id: 'fallback-athlete',
      name: { en: 'Fallback Athlete', he: 'ספורטאי' },
    } as Athlete

    render(<AthletePhoto athlete={athlete} />)

    expect(screen.getByLabelText('Photo unavailable')).toBeInTheDocument()
  })

  it('rejects duplicate or non-image responses', async () => {
    const duplicateManifest = {
      first: {
        url: 'https://example.com/player.png',
        sourceUrl: 'https://example.com/player',
        alt: 'First player',
      },
      second: {
        url: 'https://example.com/player.png',
        sourceUrl: 'https://example.com/player-two',
        alt: 'Second player',
      },
    }

    await expect(
      validateImages(duplicateManifest, async () =>
        new Response('', { headers: { 'content-type': 'image/png' } }),
      ),
    ).rejects.toThrow(/duplicate/i)
  })
})
