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
      'danny-wolf',
      'emanuel-sharp',
      'yarden-garzon',
      'gal-raviv',
      'omer-mayer',
      'noam-yaacov',
      'oscar-gloukh',
      'manor-solomon',
      'daniel-peretz',
      'stav-lemkin',
      'tai-abed',
      'neta-lavi',
      'dor-turgeman',
      'idan-toklomati',
      'liel-abada',
      'ilay-feingold',
      'tai-baribo',
      'omri-gandelman',
      'mahmoud-jaber',
      'idan-nachmias',
      'gavriel-kanikovsky',
      'anan-khalaili',
      'nikita-stoinov',
      'talia-sommer',
      'vital-kats',
      'lina-glushko',
      'maayan-laron',
      'mika-buchnik',
      'amit-vales',
      'orel-kimhi',
      'ofek-shimanov',
      'daniel-cukierman',
      'yshai-oliel',
    ])
    expect(publicRegistry.every((athlete) => athlete.eligibility.status === 'verified')).toBe(true)
    const circuitAthletes = publicRegistry.filter((athlete) => athlete.tier === 'international-circuit')
    expect(circuitAthletes).toHaveLength(8)
    expect(circuitAthletes.filter((athlete) =>
      athlete.participation.kind === 'circuit-activity' && athlete.participation.activity.circuit === 'ATP',
    )).toHaveLength(5)
    expect(circuitAthletes.filter((athlete) =>
      athlete.participation.kind === 'circuit-activity' && athlete.participation.activity.circuit === 'WTA',
    )).toHaveLength(3)
    expect(publicRegistry.filter((athlete) => athlete.tier !== 'international-circuit').every((athlete) =>
      athlete.participation.kind === 'team-affiliation' && athlete.participation.affiliation.primary,
    )).toBe(true)
  })

  it('includes only verified provider bindings', () => {
    expect(publicRegistry.flatMap((athlete) => athlete.binding?.externalId ?? [])).toEqual([
      '4683021',
      '5242502',
      '5107173',
      'oscar-gloukh',
    ])
  })

  it('uses the official Israel Tennis Association Hebrew spelling for Amit Vales', () => {
    const amit = publicRegistry.find((athlete) => athlete.id === 'amit-vales')

    expect(amit?.name.he).toBe('עמית ולס')
    expect(amit?.eligibility.publisher).toBe('Israel Tennis Association')
  })

  it('promotes WTA women only after eligibility and localized names are independently corroborated', () => {
    expect(publicRegistry.filter(({ sport, tier, genderCategory }) =>
      sport === 'tennis' && tier === 'international-circuit' && genderCategory === 'women',
    )).toHaveLength(3)

    for (const [id, he, eligibilitySource] of [
      ['lina-glushko', 'לינה גלושקו', 'https://www.billiejeankingcup.com/en/players/12a2778d-1ba0-4057-a65a-f684257482ca'],
      ['maayan-laron', 'מעיין לרון', 'https://www.billiejeankingcup.com/en/players/034f313c-d61a-4988-a02f-9e06456ed25f'],
      ['mika-buchnik', 'מיקה בוחניק', 'https://www.billiejeankingcup.com/en/players/2bbcaf7b-d899-4980-879a-989420656aaf'],
    ] as const) {
      expect(publicRegistry.find((athlete) => athlete.id === id)).toMatchObject({
        name: { he },
        eligibility: {
          publisher: 'Billie Jean King Cup',
          sourceUrl: eligibilitySource,
        },
        participation: {
          kind: 'circuit-activity',
          activity: {
            circuit: 'WTA',
            competition: 'WTA Singles Rankings numeric PDF — ISR',
            source: {
              publisher: 'WTA',
              sourceUrl: 'https://wtafiles.wtatennis.com/pdf/rankings/Singles_Numeric.pdf',
            },
          },
        },
      })
    }
  })

  it('does not publish media without approved rights', () => {
    expect(publicRegistry.every((athlete) => athlete.image === undefined)).toBe(true)
  })

  it('keeps Ben Saraf eligibility and affiliation provenance distinct and correct', () => {
    const ben = publicRegistry.find((athlete) => athlete.id === 'ben-saraf')

    expect(ben?.eligibility).toMatchObject({
      publisher: 'FIBA',
      sourceUrl: 'https://reports.fiba.basketball/reports/2025/FIBA%20U19%20Basketball%20World%20Cup/rosters.pdf',
    })
    expect(ben?.participation.kind).toBe('team-affiliation')
    if (ben?.participation.kind !== 'team-affiliation') throw new Error('Expected team participation')
    expect(ben.participation.affiliation.source).toEqual({
      publisher: 'NBA',
      sourceUrl: 'https://www.nba.com/team/1610612751/brooklyn-nets',
      retrievedAt: '2026-08-08T08:00:00.000Z',
    })
  })

  it('publishes football men only when eligibility and current overseas affiliation are independently verified', () => {
    expect(publicRegistry.filter(({ sport, genderCategory }) => sport === 'football' && genderCategory === 'men'))
      .toHaveLength(17)

    expect(publicRegistry.find(({ id }) => id === 'stav-lemkin')).toMatchObject({
      name: { en: 'Stav Lemkin', he: 'סתיו למקין' },
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/national-team-player/?player_id=132052',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'FC Twente', country: 'Netherlands' },
          competition: 'Eredivisie',
          rosterStatus: 'active',
          source: { publisher: 'FC Twente', sourceUrl: 'https://fctwente.nl/teams/eerste-selectie/spelers' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'tai-abed')).toMatchObject({
      aliases: ['Tay Abed', 'Tai Abed Kassus'],
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'Levante UD', country: 'Spain' },
          competition: 'LaLiga',
          source: { publisher: 'Levante UD', sourceUrl: 'https://www.levanteud.com/en/players/tay-abed' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'neta-lavi')).toMatchObject({
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'FC Machida Zelvia', country: 'Japan' },
          competition: 'J1 League',
          source: { publisher: 'FC Machida Zelvia', sourceUrl: 'https://www.zelvia.co.jp/club/clubteam/355524/' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'dor-turgeman')).toMatchObject({
      aliases: ['Dor David Turgeman'],
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'New England Revolution', country: 'United States' },
          competition: 'MLS',
          source: { publisher: 'New England Revolution', sourceUrl: 'https://www.revolutionsoccer.net/players/dor-turgeman/' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'idan-toklomati')).toMatchObject({
      aliases: ['Idan Gurno', 'Idan Toklomati Gurno'],
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'Charlotte FC', country: 'United States' },
          competition: 'MLS',
          source: { publisher: 'Charlotte FC', sourceUrl: 'https://www.charlottefootballclub.com/roster/' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'liel-abada')).toMatchObject({
      name: { en: 'Liel Abada' },
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/national-team-player/?player_id=113648',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'Charlotte FC', country: 'United States' },
          competition: 'MLS',
          rosterStatus: 'active',
          source: { publisher: 'Charlotte FC', sourceUrl: 'https://www.charlottefootballclub.com/players/liel-abada/' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'ilay-feingold')).toMatchObject({
      name: { en: 'Ilay Feingold' },
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/national-team-player/?player_id=133617',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'New England Revolution', country: 'United States' },
          competition: 'MLS',
          source: { publisher: 'New England Revolution', sourceUrl: 'https://www.revolutionsoccer.net/players/ilay-feingold/' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'tai-baribo')).toMatchObject({
      name: { en: 'Tai Baribo' },
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/national-team-player/?player_id=103224',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'D.C. United', country: 'United States' },
          competition: 'MLS',
          source: { publisher: 'D.C. United', sourceUrl: 'https://www.dcunited.com/players/tai-baribo/' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'omri-gandelman')).toMatchObject({
      name: { en: 'Omri Gandelman' },
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/en/players/player/?player_id=101021&season_id=23',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'U.S. Lecce', country: 'Italy' },
          competition: 'Serie A',
          source: { publisher: 'U.S. Lecce', sourceUrl: 'https://uslecce.it/giocatori/omri-gandelman/' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'mahmoud-jaber')).toMatchObject({
      name: { en: 'Mahmoud Jaber' },
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/national-team-player/?player_id=89351',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'AS Saint-Étienne', country: 'France' },
          competition: 'Ligue 2',
          source: { publisher: 'AS Saint-Étienne', sourceUrl: 'https://www.asse.fr/en/club/saison-2026-2027/effectif/jaber-mahmoud-j251' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'idan-nachmias')).toMatchObject({
      name: { en: 'Idan Nachmias' },
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/national-team-player/?player_id=114368',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'PFC Ludogorets', country: 'Bulgaria' },
          competition: 'Bulgarian First League',
          source: { publisher: 'PFC Ludogorets', sourceUrl: 'https://www.ludogorets.com/en/a-team/' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'gavriel-kanikovsky')).toMatchObject({
      aliases: ['Gabi Kanichowsky', 'Gavriel Kanichowsky', 'Gavriel Kanikovszki'],
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/national-team-player/?player_id=77673',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'Ferencvárosi TC', country: 'Hungary' },
          competition: 'Nemzeti Bajnokság I',
          source: { publisher: 'Ferencvárosi TC', sourceUrl: 'https://www.fradi.hu/en/football/men-s/squad' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'anan-khalaili')).toMatchObject({
      aliases: ['Anan Khlaili'],
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/national-team-player/?player_id=137896',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'Royale Union Saint-Gilloise', country: 'Belgium' },
          competition: 'Belgian Pro League',
          source: { publisher: 'Royale Union Saint-Gilloise', sourceUrl: 'https://rusg.brussels/en/team/anan-khalaili' },
        },
      },
    })

    expect(publicRegistry.find(({ id }) => id === 'nikita-stoinov')).toMatchObject({
      aliases: ['Nikita Stoyanov', 'Nikita Stoioanov'],
      eligibility: {
        publisher: 'Israel Football Association',
        sourceUrl: 'https://www.football.org.il/national-team-player/?player_id=164227',
      },
      participation: {
        kind: 'team-affiliation',
        affiliation: {
          organization: { name: 'FC Dinamo 1948 București', country: 'Romania' },
          competition: 'Romanian SuperLiga',
          source: { publisher: 'FC Dinamo 1948 București', sourceUrl: 'https://dinamo1948.ro/team/nikita-stoinov/' },
        },
      },
    })
  })
})

describe('candidate queue', () => {
  it('keeps unresolved candidates outside the public registry', () => {
    const candidates = candidateQueueSchema.parse(
      JSON.parse(readFileSync('data/review/candidates.json', 'utf8')),
    )

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'jordan-hasson',
      'vladimir-bazilevskiy',
      'tim-vaisman',
      'sofiia-nagornaia',
      'omri-glazer',
      'ido-shahar-football',
      'asaf-tzur',
      'or-blorian',
      'eli-dasa',
      'guy-mizrahi',
      'roy-revivo',
      'itay-rotman',
      'yarin-levi',
      'eliel-peretz',
      'yarden-shua',
      'sayd-abu-farhi',
      'stav-turiel',
      'amit-beilin',
      'agam-haviv',
      'fortun-rubin',
      'itaf-alkisi',
      'shani-david',
      'asia-derksan',
      'or-divan',
      'tal-fainegezicht',
      'tamar-lipstik-geva',
      'hili-shalom',
      'mia-shvil',
      'maya-sirota',
      'maya-cabrera',
      'talna-tal',
      'mihala-worko',
      'maria-almzri',
      'elis-blokhin',
      'smadar-cohen',
      'zohar-cohen',
      'shahar-nakav',
      'rachel-shteinshneider',
      'noa-selimhodzic',
      'shon-abaev',
      'nir-tichon',
      'nick-ougortsin',
      'nikita-zitserman',
      'shon-kazinets',
      'itay-kerner',
      'samson-goldshtein',
      'pnina-basov',
      'lior-leshem',
      'yael-fatiev',
      'zeev-buium',
    ])
    expect(candidates.find(({ id }) => id === 'nir-tichon')?.state).toBe('affiliation-conflict')
    expect(candidates.find(({ id }) => id === 'pnina-basov')?.state).toBe('affiliation-conflict')
    expect(candidates.find(({ id }) => id === 'zeev-buium')?.state).toBe('rejected')
    expect(candidates.filter(({ id }) => !['nir-tichon', 'pnina-basov', 'zeev-buium'].includes(id))
      .every(({ state }) => state === 'needs-evidence')).toBe(true)
    expect(candidates.every((candidate) => !publicRegistry.some((athlete) => athlete.id === candidate.id))).toBe(true)
  })

  it('classifies the private ATP and WTA tennis universes while keeping public and private ids disjoint', () => {
    const candidates = candidateQueueSchema.parse(
      JSON.parse(readFileSync('data/review/candidates.json', 'utf8')),
    )
    const publicIds = new Set(publicRegistry.map(({ id }) => id))
    const zeev = candidates.find(({ id }) => id === 'zeev-buium')

    expect(candidates.filter(({ id }) => ['jordan-hasson', 'vladimir-bazilevskiy', 'tim-vaisman'].includes(id)))
      .toHaveLength(3)
    expect(candidates.filter(({ id }) => ['lina-glushko', 'maayan-laron', 'mika-buchnik', 'sofiia-nagornaia'].includes(id)))
      .toHaveLength(1)
    expect(candidates.find(({ id }) => id === 'sofiia-nagornaia')?.signals[0]?.sourceUrl)
      .toBe('https://wtafiles.wtatennis.com/pdf/rankings/Singles_Numeric.pdf')
    expect(candidates.filter(({ sport, genderCategory }) => sport === 'football' && genderCategory === 'men'))
      .toHaveLength(13)
    expect(candidates.filter(({ sport, genderCategory }) => sport === 'football' && genderCategory === 'women'))
      .toHaveLength(22)
    expect(candidates.find(({ id }) => id === 'shon-abaev')?.name.he).toBeUndefined()
    expect(zeev?.signals.some(({ note }) => /USA representation/i.test(note))).toBe(true)
    expect(zeev?.reviewerNote).toMatch(/rejected/i)
    expect(candidates.some(({ id }) => publicIds.has(id))).toBe(false)
  })
})

describe('injectable registry compiler', () => {
  it('compiles the schema-valid public tennis fixture without mutation', () => {
    const [athlete] = compileRegistryBundle(registryBundleFixture, '2026-07-23T08:00:00.000Z')

    expect(athlete).toMatchObject({
      id: 'athlete-one',
      sport: 'tennis',
      binding: { provider: 'curated', sport: 'tennis' },
      participation: {
        kind: 'team-affiliation',
        affiliation: { competition: 'ITF World Tennis Tour' },
      },
    })
  })

  it('compiles a circuit athlete without a team affiliation or provider binding', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].tier = 'international-circuit'
    bundle.affiliations = []
    bundle.providerBindings = []
    bundle.circuitActivities = [{
      id: 'activity-athlete-one-wimbledon-2026',
      athleteId: 'athlete-one',
      circuit: 'WTA',
      discipline: 'singles',
      competition: 'Wimbledon',
      season: '2026',
      activityType: 'sanctioned-result',
      effectiveAt: '2026-07-10T08:00:00.000Z',
      status: 'verified',
      source: {
        publisher: 'WTA',
        sourceUrl: 'https://example.com/wta/wimbledon/athlete-one',
        retrievedAt: '2026-07-23T08:00:00.000Z',
      },
    }]

    const athlete = compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]
    expect(athlete).toMatchObject({
      participation: {
        kind: 'circuit-activity',
        activity: { id: 'activity-athlete-one-wimbledon-2026' },
      },
    })
    expect(athlete?.binding).toBeUndefined()
  })

  it('compiles a team athlete without a provider binding', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.providerBindings = []

    expect(compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]).toMatchObject({
      participation: { kind: 'team-affiliation' },
    })
    expect(compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]?.binding).toBeUndefined()
  })

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
    bundle.providerBindings[0].season = '2025-26'

    expect(compileRegistryBundle(bundle, '2026-07-23')[0]?.participation).toMatchObject({
      kind: 'team-affiliation',
      affiliation: { rosterStatus: 'released' },
    })
  })

  it('rejects malformed ESPN NBA binding seasons before compiling a snapshot', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.providerBindings[0].season = 'NBA-2025-26'

    expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')).toThrow(/ESPN NBA seasons/i)
  })

  it('selects the newest evidence, matching binding, and approved media deterministically', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.providerBindings[0].season = '2025-26'
    bundle.evidence[0].retrievedAt = '2026-07-23T07:00:00.000Z'
    bundle.providerBindings[0].verifiedAt = '2026-07-23T07:00:00.000Z'
    bundle.media[0].retrievedAt = '2026-07-23T07:00:00.000Z'
    bundle.evidence.push({ ...bundle.evidence[0], id: 'evidence-new', retrievedAt: '2026-07-23T08:00:00.000Z' })
    bundle.providerBindings.push({ ...bundle.providerBindings[0], id: 'binding-new', externalId: 'new', verifiedAt: '2026-07-23T08:00:00.000Z' })
    bundle.media.push({ ...bundle.media[0], id: 'media-new', retrievedAt: '2026-07-23T08:00:00.000Z' })

    const athlete = compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]
    expect(athlete?.eligibility.id).toBe('evidence-new')
    expect(athlete?.binding?.id).toBe('binding-new')
    expect(athlete?.image?.id).toBe('media-new')
  })

  it('rejects future eligibility provenance but ignores a nonmatching optional binding', () => {
    const future = structuredClone(registryBundleFixture)
    future.athletes[0].sport = 'basketball'
    future.affiliations[0].competition = 'NBA'
    future.providerBindings[0].provider = 'espn-nba'
    future.providerBindings[0].sport = 'basketball'
    future.providerBindings[0].competition = 'NBA'
    future.providerBindings[0].season = '2025-26'
    future.evidence[0].retrievedAt = '2026-07-24T08:00:00.000Z'
    future.providerBindings[0].verifiedAt = '2026-07-24T08:00:00.000Z'

    expect(() => compileRegistryBundle(future, '2026-07-23T08:00:00.000Z')).toThrow(/verified eligibility/i)

    const mismatch = structuredClone(future)
    mismatch.evidence[0].retrievedAt = '2026-07-23T08:00:00.000Z'
    mismatch.providerBindings[0].verifiedAt = '2026-07-23T08:00:00.000Z'
    mismatch.providerBindings[0].competition = 'EuroLeague'
    expect(compileRegistryBundle(mismatch, '2026-07-23T08:00:00.000Z')[0]?.binding).toBeUndefined()
  })

  it('selects the unique newest qualifying circuit activity deterministically', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].tier = 'international-circuit'
    bundle.affiliations = []
    bundle.providerBindings = []
    bundle.circuitActivities = [
      {
        id: 'activity-new', athleteId: 'athlete-one', circuit: 'WTA', discipline: 'singles',
        competition: 'Wimbledon', season: '2026', activityType: 'sanctioned-result',
        effectiveAt: '2026-07-10T08:00:00.000Z', status: 'verified',
        source: { publisher: 'WTA', sourceUrl: 'https://example.com/new', retrievedAt: '2026-07-23T08:00:00.000Z' },
      },
      {
        id: 'activity-old', athleteId: 'athlete-one', circuit: 'WTA', discipline: 'singles',
        competition: 'WTA Rankings', season: '2026', activityType: 'ranking',
        effectiveAt: '2026-07-01T08:00:00.000Z', status: 'verified',
        source: { publisher: 'WTA', sourceUrl: 'https://example.com/old', retrievedAt: '2026-07-23T08:00:00.000Z' },
      },
    ]

    expect(compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')[0]?.participation).toMatchObject({
      kind: 'circuit-activity',
      activity: { id: 'activity-new' },
    })
  })

  it('rejects ambiguous newest circuit activities with identical effective times', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].tier = 'international-circuit'
    bundle.affiliations = []
    bundle.providerBindings = []
    bundle.circuitActivities = [
      {
        id: 'activity-one', athleteId: 'athlete-one', circuit: 'WTA', discipline: 'singles',
        competition: 'Wimbledon', season: '2026', activityType: 'sanctioned-result',
        effectiveAt: '2026-07-10T08:00:00.000Z', status: 'verified',
        source: { publisher: 'WTA', sourceUrl: 'https://example.com/one', retrievedAt: '2026-07-23T08:00:00.000Z' },
      },
      {
        id: 'activity-two', athleteId: 'athlete-one', circuit: 'WTA', discipline: 'doubles',
        competition: 'Wimbledon', season: '2026', activityType: 'sanctioned-result',
        effectiveAt: '2026-07-10T08:00:00.000Z', status: 'verified',
        source: { publisher: 'WTA', sourceUrl: 'https://example.com/two', retrievedAt: '2026-07-23T08:00:00.000Z' },
      },
    ]

    expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')).toThrow(/ambiguous|newest/i)
  })

  it('treats equivalent instants equally and rejects fractional-second future provenance', () => {
    const bundle = structuredClone(registryBundleFixture)
    bundle.athletes[0].sport = 'basketball'
    bundle.affiliations[0].competition = 'NBA'
    bundle.providerBindings[0].provider = 'espn-nba'
    bundle.providerBindings[0].sport = 'basketball'
    bundle.providerBindings[0].competition = 'NBA'
    bundle.providerBindings[0].season = '2025-26'
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
    bundle.providerBindings[0].season = '2025-26'
    bundle.affiliations[0].source.retrievedAt = '2026-07-23T08:00:00.500Z'

    expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00Z')).toThrow(/affiliation/i)
  })

  it.each(['loan', 'reserve', 'injured', 'suspended', 'released', 'unknown'] as const)(
    'refuses to compile a second current primary %s affiliation',
    (rosterStatus) => {
      const bundle = structuredClone(registryBundleFixture)
      bundle.affiliations.push({
        ...bundle.affiliations[0],
        id: `affiliation-athlete-one-${rosterStatus}`,
        rosterStatus,
      })

      expect(() => compileRegistryBundle(bundle, '2026-07-23T08:00:00.000Z')).toThrow(
        /exactly one current primary overseas affiliation/i,
      )
    },
  )
})
