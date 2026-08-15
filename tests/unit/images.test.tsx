import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { AthleteCard } from '../../src/components/AthleteCard'
import { AthleteDrawer } from '../../src/components/AthleteDrawer'
import { AthletePhoto } from '../../src/components/AthletePhoto'
import { publicRegistry } from '../../src/data/registry'
import { publicMediaSchema, type Athlete } from '../../src/domain/athlete'
import { assertImageManifestMatchesSnapshot, validateImages } from '../../scripts/validate-images'
import registryMedia from '../../data/registry/media.json'
import snapshot from '../../public/data/snapshot.json'
import manifest from '../../public/images/athletes/manifest.json'

describe('athlete imagery', () => {
  it('accepts the current approved snapshot and matching manifest boundary', () => {
    expect(typeof assertImageManifestMatchesSnapshot).toBe('function')
    expect(assertImageManifestMatchesSnapshot(snapshot, manifest)).toEqual(manifest)
  })

  it('rejects a snapshot approved image missing from the manifest', () => {
    expect(typeof assertImageManifestMatchesSnapshot).toBe('function')
    expect(() => assertImageManifestMatchesSnapshot({
      ...snapshot,
      athletes: [athleteWithImage()],
    }, {})).toThrow(/missing|manifest/i)
  })

  it('rejects an orphan manifest entry', () => {
    expect(typeof assertImageManifestMatchesSnapshot).toBe('function')
    expect(() => assertImageManifestMatchesSnapshot(snapshot, {
      orphan: approvedImage(),
    })).toThrow(/orphan|snapshot/i)
  })

  it('rejects manifest metadata that differs from the snapshot', () => {
    expect(typeof assertImageManifestMatchesSnapshot).toBe('function')
    const athlete = athleteWithImage()
    expect(() => assertImageManifestMatchesSnapshot({ ...snapshot, athletes: [athlete] }, {
      [athlete.id]: { ...approvedImage(), alt: 'Mismatched portrait' },
    })).toThrow(/metadata|mismatch/i)
  })

  it('returns an exact approved manifest for subsequent fetch validation', async () => {
    expect(typeof assertImageManifestMatchesSnapshot).toBe('function')
    const athlete = athleteWithImage()
    const exact = { [athlete.id]: approvedImage() }
    const manifestForFetch = assertImageManifestMatchesSnapshot(
      { ...snapshot, athletes: [athlete] },
      exact,
    )
    let fetched = 0

    await expect(validateImages(manifestForFetch, async () => {
      fetched += 1
      return new Response('', { headers: { 'content-type': 'image/png' } })
    })).resolves.toBe(1)
    expect(fetched).toBe(1)
  })

  it('ships only schema-valid approved media and excludes review source URLs', () => {
    expect(publicRegistry.every((athlete) => athlete.image === undefined || publicMediaSchema.safeParse(athlete.image).success)).toBe(true)
    expect(snapshot.athletes.every((athlete) => athlete.image === undefined || publicMediaSchema.safeParse(athlete.image).success)).toBe(true)
    expect(Object.values(manifest).every((image) => publicMediaSchema.safeParse(image).success)).toBe(true)
    const reviewUrls = registryMedia.filter((image) => image.rightsStatus !== 'approved').map((image) => image.url)
    const publicUrls = [
      ...publicRegistry.flatMap((athlete) => athlete.image ? [athlete.image.url] : []),
      ...snapshot.athletes.flatMap((athlete) => athlete.image ? [athlete.image.url] : []),
      ...Object.values(manifest).map((image) => image.url),
    ]
    expect(publicUrls).not.toEqual(expect.arrayContaining(reviewUrls))
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

  it.each([
    ['javascript image URL', { url: 'javascript:alert(1)' }],
    ['data source URL', { sourceUrl: 'data:text/html,unsafe' }],
    ['unknown license', { license: 'unlicensed' }],
    ['unknown usage', { usage: 'unsafe' }],
    ['invalid retrieval date', { retrievedAt: 'not-a-date' }],
    ['non-string attribution', { attribution: 7 }],
    ['unknown media key', { private: true }],
  ])('falls back when runtime media has %s', (_case, patch) => {
    const athlete = athleteWithImage(patch)
    render(<AthletePhoto athlete={athlete} />)
    expect(screen.getByLabelText('Photo unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('retries a replacement image after a failed previous URL', () => {
    const first = athleteWithImage({ url: 'https://images.example.com/first.png' })
    const second = athleteWithImage({ url: 'https://images.example.com/second.png' })
    const { rerender } = render(<AthletePhoto athlete={first} />)
    fireEvent.error(screen.getByRole('img', { name: 'An athlete portrait' }))
    expect(screen.getByLabelText('Photo unavailable')).toBeInTheDocument()
    rerender(<AthletePhoto athlete={second} />)
    expect(screen.getByRole('img', { name: 'An athlete portrait' })).toHaveAttribute('src', second.image?.url)
  })

  it('renders attribution as text in a card button and as a source link in the drawer', () => {
    const athlete = athleteWithImage()
    const { rerender } = render(<AthleteCard athlete={athlete} rank={1} onOpen={() => {}} />)
    expect(screen.getByRole('button').querySelector('a')).toBeNull()
    expect(screen.getByText('Example holder (cc-by)')).toBeInTheDocument()

    rerender(<AthleteDrawer athlete={athlete} onClose={() => {}} returnFocus={createRef()} />)
    expect(screen.getByRole('link', { name: /image rights: example holder/i })).toHaveAttribute('href', 'https://example.com/source')
  })

  it('rejects review and expired rows from the public manifest', async () => {
    await expect(validateImages({ review: { ...approvedImage(), rightsStatus: 'review' } }, async () => new Response())).rejects.toThrow()
    await expect(validateImages({ expired: { ...approvedImage(), rightsStatus: 'expired' } }, async () => new Response())).rejects.toThrow()
  })

  it('validates and fetches every approved documented public image asset', async () => {
    const fetcher = async () => {
      fetched += 1
      return new Response('', { headers: { 'content-type': 'image/png' } })
    }
    let fetched = 0
    const count = await validateImages({
      approved: approvedImage(),
      second: { ...approvedImage(), url: 'https://images.example.com/second.png' },
    }, fetcher)

    expect(count).toBe(2)
    expect(fetched).toBe(2)
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

  it('rejects a redirect whose final URL is not HTTPS', async () => {
    await expect(validateImages({ athlete: approvedImage() }, async () => response({ url: 'http://images.example.com/final.png' }))).rejects.toThrow(/final URL.*HTTPS/i)
  })

  it('normalizes abort-aware timeout failures to the timeout error', async () => {
    const abortAwareFetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('request aborted'), { name: 'AbortError' }))
      })
    })
    await expect(validateImages({ athlete: approvedImage() }, abortAwareFetcher, { timeoutMs: 5 })).rejects.toThrow(/timed out/i)
  })

  it('cancels late responses from abort-ignoring fetches after a timeout', async () => {
    let cancelled = 0
    const lateResponse = response({ cancel: () => { cancelled += 1 } })
    const delayedFetcher: typeof fetch = () => new Promise((resolve) => {
      setTimeout(() => resolve(lateResponse), 15)
    })
    await expect(validateImages({ athlete: approvedImage() }, delayedFetcher, { timeoutMs: 5 })).rejects.toThrow(/timed out/i)
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(cancelled).toBe(1)
  })

  it('times out fetches that ignore abort signals and cancels normal response bodies', async () => {
    await expect(validateImages({ athlete: approvedImage() }, () => new Promise(() => {}), { timeoutMs: 5 })).rejects.toThrow(/timed out/i)
    let cancelled = 0
    await validateImages({ athlete: approvedImage() }, async () => response({ cancel: () => { cancelled += 1 } }))
    expect(cancelled).toBe(1)
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

function athleteWithImage(patch: Record<string, unknown> = {}) {
  const athlete = snapshot.athletes[0]
  if (!athlete) throw new Error('Expected a fixture athlete')
  return { ...athlete, image: { ...approvedImage(), ...patch } } as unknown as Athlete
}

function response({ url = 'https://images.example.com/player.png', cancel }: { url?: string, cancel?: () => void } = {}) {
  return {
    ok: true,
    status: 200,
    url,
    headers: new Headers({ 'content-type': 'image/png' }),
    body: { cancel },
  } as unknown as Response
}
