import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { snapshotSchema } from '../../src/domain/athlete'
import type { Sport } from '../../src/domain/taxonomy'

const snapshotJson = snapshotSchema.parse(JSON.parse(readFileSync(new URL('../../public/data/snapshot.json', import.meta.url), 'utf8')))
const sports: Sport[] = [
  'football', 'basketball', 'hockey', 'handball', 'volleyball', 'baseball',
  'softball', 'rugby', 'tennis', 'cycling', 'motorsport', 'golf', 'athletics',
  'aquatics', 'judo', 'combat', 'gymnastics', 'sailing', 'winter-sport', 'other',
]

function manySportSnapshot() {
  const base = snapshotJson.athletes[2]
  return {
    ...snapshotJson,
    athletes: sports.map((sport, index) => ({
      ...base,
      id: `responsive-${sport}`,
      name: { en: `Responsive Athlete ${index + 1}`, he: `Responsive Athlete ${index + 1}` },
      sport,
      performance: { status: 'unavailable' as const, state: 'unavailable' as const, stats: null, reason: 'not-integrated' as const },
    })),
  }
}

function filterSnapshot() {
  const athlete = (id: string) => {
    const value = snapshotJson.athletes.find((candidate) => candidate.id === id)
    if (value === undefined) throw new Error(`Missing fixture athlete: ${id}`)
    return value
  }
  const deni = athlete('deni-avdija')
  const ben = athlete('ben-saraf')
  const oscar = athlete('oscar-gloukh')

  return {
    ...snapshotJson,
    athletes: [
      { ...deni, tier: 'senior-professional' as const, genderCategory: 'men' as const, lifecycleStatus: 'active' as const },
      { ...ben, tier: 'development' as const, genderCategory: 'men' as const, lifecycleStatus: 'active' as const },
      { ...oscar, tier: 'senior-professional' as const, genderCategory: 'women' as const, lifecycleStatus: 'injured' as const },
    ],
  }
}

test('mobile layout has no page-level horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /israel overseas/i })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  const filterBar = page.locator('.filter-bar')
  await expect(filterBar).toBeVisible()
  expect(await filterBar.evaluate((element) => getComputedStyle(element).position)).toBe('static')
  await page.getByText('Coverage ledger details').scrollIntoViewIfNeeded()
  await page.getByText('Coverage ledger details').click()
  await expect(page.getByText('WTA Singles Rankings numeric PDF ISR rows as of 03 August 2026')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  const lifecycle = page.getByRole('combobox', { name: /lifecycle status/i })
  await lifecycle.scrollIntoViewIfNeeded()
  await expect(lifecycle).toBeVisible()
  const lifecycleBox = await lifecycle.boundingBox()
  expect(lifecycleBox?.y).toBeGreaterThanOrEqual(0)
  expect((lifecycleBox?.y ?? 0) + (lifecycleBox?.height ?? 0)).toBeLessThanOrEqual(844)
})

test('390px filters, RTL profile, and drawer keep the directory usable', async ({ page }) => {
  await page.route('**/data/snapshot.json', (route) => route.fulfill({ json: filterSnapshot() }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const tier = page.getByRole('combobox', { name: 'Athlete tier' })
  const gender = page.getByRole('combobox', { name: 'Gender category' })
  const lifecycle = page.getByRole('combobox', { name: 'Lifecycle status' })
  await tier.selectOption('development')
  await expect(tier).toHaveValue('development')
  await expect(page.getByRole('heading', { name: 'Ben Saraf' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deni Avdija' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Oscar Gloukh' })).toHaveCount(0)
  await tier.selectOption('all')
  await gender.selectOption('women')
  await expect(gender).toHaveValue('women')
  await expect(page.getByRole('heading', { name: 'Oscar Gloukh' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deni Avdija' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ben Saraf' })).toHaveCount(0)
  await gender.selectOption('all')
  await lifecycle.selectOption('injured')
  await expect(lifecycle).toHaveValue('injured')
  await expect(page.getByRole('heading', { name: 'Oscar Gloukh' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deni Avdija' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ben Saraf' })).toHaveCount(0)
  await lifecycle.selectOption('all')

  const dimensions = page.locator('.filter-dimensions')
  expect(await dimensions.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1)
  for (const select of [tier, gender, lifecycle]) {
    expect(await select.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
  }

  await page.getByRole('button', { name: 'עברית' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('combobox', { name: 'רמת ספורטאי' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'קטגוריית מגדר' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'סטטוס פעילות' })).toBeVisible()

  await page.getByRole('button', { name: /אוסקר גלוך/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('בסיס הזכאות')).toBeVisible()
  await expect(dialog.getByRole('link', { name: /מקור הזכאות/ })).toBeVisible()
  await expect(dialog.getByRole('link', { name: /מקור הקבוצה הנוכחית/ })).toBeVisible()
  await expect(dialog.getByRole('link', { name: /מקור הביצועים/ })).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('wide many-sport filter owns overflow and keeps the final sport reachable', async ({ page }) => {
  await page.route('**/data/snapshot.json', (route) => route.fulfill({ json: manySportSnapshot() }))
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'All sports' })).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const scroller = page.locator('.sport-filters')
  expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)

  const finalSport = page.getByRole('button', { name: 'Other' })
  await finalSport.scrollIntoViewIfNeeded()
  const [scrollerBox, finalBox] = await Promise.all([scroller.boundingBox(), finalSport.boundingBox()])
  expect(finalBox?.x).toBeGreaterThanOrEqual(scrollerBox?.x ?? 0)
  expect((finalBox?.x ?? 0) + (finalBox?.width ?? 0)).toBeLessThanOrEqual(
    (scrollerBox?.x ?? 0) + (scrollerBox?.width ?? 0) + 1,
  )
  expect(await scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
})

test('desktop and Hebrew RTL controls remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: 'עברית' }).click()

  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('searchbox')).toHaveAttribute(
    'placeholder',
    'חיפוש ספורטאים, קבוצות ותחרויות…',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('expanded review snapshot distinguishes team, circuit, identity-only, and locationless records', async ({ page }) => {
  expect(snapshotJson.athletes).toHaveLength(37)
  expect(snapshotJson.coverage.complete).toBe(false)

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')

  await expect(page.getByText('37 verified athletes', { exact: true })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Coverage incomplete: 1 of 7 universes healthy' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deni Avdija' })).toBeVisible()

  await page.getByRole('button', { name: 'Open Deni Avdija' }).click()
  const teamProfile = page.getByRole('dialog')
  await expect(teamProfile.getByRole('link', { name: 'Current team source' })).toHaveAttribute(
    'href',
    'https://www.nba.com/player/1630166/deni-avdija',
  )
  await page.getByRole('button', { name: 'Close Deni Avdija details' }).click()

  await page.getByRole('button', { name: 'Tennis' }).click()
  const tier = page.getByRole('combobox', { name: 'Athlete tier' })
  await tier.selectOption('international-circuit')
  await expect(page.getByRole('heading', { name: 'Amit Vales' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Amit Vales' }).click()
  const circuitProfile = page.getByRole('dialog')
  await expect(circuitProfile.getByRole('link', { name: 'Circuit activity source' })).toHaveAttribute(
    'href',
    'https://www.atptour.com/en/rankings/singles?RankRange=0-5000&Region=ISR',
  )
  await expect(circuitProfile.getByText('Stats source pending')).toBeVisible()
  await page.getByRole('button', { name: 'Close Amit Vales details' }).click()

  await page.getByRole('button', { name: 'Basketball' }).click()
  await tier.selectOption('all')
  const gender = page.getByRole('combobox', { name: 'Gender category' })
  await gender.selectOption('women')
  await expect(page.getByRole('heading', { name: 'Yarden Garzon' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deni Avdija' })).toHaveCount(0)
  await tier.selectOption('college')
  await expect(page.getByRole('heading', { name: 'Gal Raviv' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Yarden Garzon' })).toHaveCount(0)

  await page.getByRole('button', { name: 'All sports' }).click()
  await tier.selectOption('all')
  await gender.selectOption('all')
  await page.getByRole('button', { name: 'Rankings' }).click()
  await expect(page.getByText('Rankings only include sourced season totals. Identity-only records stay out until their statistics are verified.')).toBeVisible()
  await expect(page.getByText('Amit Vales', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Map' }).click()
  await expect(page.getByRole('button', { name: 'Open Amit Vales from map' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open Deni Avdija from map' })).toBeVisible()
})
