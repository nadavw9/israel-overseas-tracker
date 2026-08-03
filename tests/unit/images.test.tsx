import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AthletePhoto } from '../../src/components/AthletePhoto'
import { publicRegistry } from '../../src/data/registry'
import type { Athlete } from '../../src/domain/athlete'
import { validateImages } from '../../scripts/validate-images'
import snapshot from '../../public/data/snapshot.json'
import manifest from '../../public/images/athletes/manifest.json'

describe('athlete imagery', () => {
  it('omits media assets that do not have approved reuse rights', () => {
    expect(publicRegistry.every((athlete) => athlete.image === undefined)).toBe(true)
  })

  it('ships no unapproved image artifacts', () => {
    expect(snapshot.athletes.every((athlete) => athlete.image === undefined)).toBe(true)
    expect(manifest).toEqual({})
  })

  it('renders an accessible fallback when a record has no image', () => {
    const athlete = {
      id: 'fallback-athlete',
      name: { en: 'Fallback Athlete', he: 'ספורטאי' },
    } as Athlete

    render(<AthletePhoto athlete={athlete} />)

    expect(screen.getByLabelText('Photo unavailable')).toBeInTheDocument()
  })

  it.each(['review', 'expired', undefined, 'approved without usage'] as const)(
    'does not render remote media without approved documented rights (%s)',
    (caseName) => {
      const image = {
        url: 'https://images.example.com/reviewed.png',
        sourceUrl: 'https://example.com/source',
        alt: 'Rights Athlete portrait',
        rightsStatus: caseName === 'approved without usage' ? 'approved' : caseName,
        rightsHolder: 'Example holder',
        license: 'cc-by',
        usage: caseName === 'approved without usage' ? undefined : 'editorial-display',
        retrievedAt: '2026-07-23T08:00:00.000Z',
      }
      const athlete = {
        id: 'rights-athlete',
        name: { en: 'Rights Athlete', he: '×ª×–×•×™×•×ª' },
        image,
      } as unknown as Athlete

      render(<AthletePhoto athlete={athlete} />)

      expect(screen.getByLabelText('Photo unavailable')).toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(document.querySelector('[src="https://images.example.com/reviewed.png"]')).toBeNull()
    },
  )

  it('renders approved media with accessible rights attribution and falls back on image failure', () => {
    const athlete = {
      id: 'approved-athlete',
      name: { en: 'Approved Athlete', he: '×ž×•××©×¨' },
      image: {
        url: 'https://images.example.com/approved.png',
        sourceUrl: 'https://example.com/source',
        alt: 'Approved Athlete portrait',
        rightsStatus: 'approved',
        rightsHolder: 'Example holder',
        license: 'cc-by',
        usage: 'editorial-display',
        retrievedAt: '2026-07-23T08:00:00.000Z',
      },
    } as unknown as Athlete

    render(<AthletePhoto athlete={athlete} />)

    const image = screen.getByRole('img', { name: 'Approved Athlete portrait' })
    expect(screen.getByRole('link', { name: /image rights: example holder \(cc-by\)/i })).toHaveAttribute('href', 'https://example.com/source')

    fireEvent.error(image)
    expect(screen.getByLabelText('Photo unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('uses provided attribution in its accessible rights link', () => {
    const athlete = {
      id: 'attributed-athlete',
      name: { en: 'Attributed Athlete', he: '×™×™×—×•×¡' },
      image: {
        url: 'https://images.example.com/attributed.png',
        sourceUrl: 'https://example.com/source',
        alt: 'Attributed Athlete portrait',
        rightsStatus: 'approved',
        rightsHolder: 'Example holder',
        license: 'cc-by',
        attribution: 'Photo by Example',
        usage: 'editorial-display',
        retrievedAt: '2026-07-23T08:00:00.000Z',
      },
    } as unknown as Athlete

    render(<AthletePhoto athlete={athlete} />)
    expect(screen.getByRole('link', { name: /image rights: photo by example/i })).toHaveAttribute('href', 'https://example.com/source')
  })

  it('validates and fetches only approved documented image assets', async () => {
    const fetcher = async () => {
      fetched += 1
      return new Response('', { headers: { 'content-type': 'image/png' } })
    }
    let fetched = 0
    const count = await validateImages({
      approved: approvedImage(),
      review: { ...approvedImage(), rightsStatus: 'review', url: 'https://images.example.com/review.png' },
      expired: { ...approvedImage(), rightsStatus: 'expired', url: 'https://images.example.com/expired.png' },
    }, fetcher)

    expect(count).toBe(1)
    expect(fetched).toBe(1)
  })

  it.each([
    ['missing license', { ...approvedImage(), license: undefined }, /license/i],
    ['missing rights holder', { ...approvedImage(), rightsHolder: undefined }, /rights holder/i],
    ['non-HTTPS URL', { ...approvedImage(), url: 'http://images.example.com/player.png' }, /HTTPS/i],
    ['unknown field', { ...approvedImage(), unexpected: true }, /unrecognized/i],
    ['malformed athlete ID', { ...approvedImage() }, /Invalid key/i, { 'not a slug!': approvedImage() }],
  ] as const)('rejects approved manifest metadata with %s', async (_case, image, message, manifest = { athlete: image }) => {
    await expect(validateImages(manifest, async () => new Response())).rejects.toThrow(message)
  })

  it('rejects duplicate approved URLs and failed or non-image approved responses', async () => {
    await expect(validateImages({ first: approvedImage(), second: { ...approvedImage(), sourceUrl: 'https://example.com/second' } }, async () => new Response('', { headers: { 'content-type': 'image/png' } }))).rejects.toThrow(/duplicate/i)
    await expect(validateImages({ athlete: approvedImage() }, async () => new Response('', { status: 500, headers: { 'content-type': 'image/png' } }))).rejects.toThrow(/HTTP 500/i)
    await expect(validateImages({ athlete: approvedImage() }, async () => new Response('', { headers: { 'content-type': 'text/html' } }))).rejects.toThrow(/text\/html/i)
  })
})

function approvedImage() {
  return {
    url: 'https://images.example.com/player.png',
    sourceUrl: 'https://example.com/source',
    alt: 'An athlete portrait',
    rightsStatus: 'approved' as const,
    rightsHolder: 'Example holder',
    license: 'cc-by' as const,
    usage: 'editorial-display' as const,
    retrievedAt: '2026-07-23T08:00:00.000Z',
  }
}
