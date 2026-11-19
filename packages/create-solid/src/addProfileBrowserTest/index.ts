import { readLocaleSettings } from '../configureLocales/catalogs.ts'
import type { StagedContext } from '../types.ts'

const themeCheck = `
  const theme = await label(
    'components/molecules/ThemeToggle',
    'themeToggle_select'
  )
  const dark = await label(
    'components/molecules/ThemeToggle',
    'themeToggle_dark'
  )
  await page.getByRole('button', { name: theme }).click()
  await page.getByRole('menuitemradio', { name: dark, exact: true }).click()
  await expect(page.locator('html')).toHaveClass('dark')
  const entry = await page
    .locator('script[type="module"][src]')
    .first()
    .getAttribute('src')
  if (!entry) throw new Error('Missing application entry module')
  const requested = Promise.withResolvers<null>()
  const released = Promise.withResolvers<null>()
  await page.route(new URL(entry, page.url()).href, async route => {
    requested.resolve(null)
    await released.promise
    await route.continue()
  })
  try {
    await page.reload({ waitUntil: 'commit' })
    await requested.promise
    await expect(page.locator('html')).toHaveClass('dark')
  } finally {
    released.resolve(null)
    await page.unrouteAll({ behavior: 'wait' })
  }`
const fontCheck = `
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(1)
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px Inter')))
    .toBe(true)`

const staticPublication = `
test.describe('prerendered publication', () => {
  test.use({ javaScriptEnabled: false })

  test('serves the localized page and publication files without JavaScript', async ({
    page,
    request
  }) => {
    const root = await page.goto('/')
    expect(root?.ok()).toBe(true)
    await expect(page.locator('html')).toHaveAttribute('lang', tag(base))
    const notFound = 404
    for (const locale of locales) {
      const direct = await page.goto(\`/\${locale}/\`)
      expect(direct?.ok()).toBe(true)
      await expect(page.locator('html')).toHaveAttribute('lang', tag(locale))
      for (const alternate of locales) {
        await expect(
          page.locator(\`head link[hreflang="\${alternate}"]\`)
        ).toHaveAttribute('href', new RegExp(\`/\${alternate}/?$\`, 'u'))
      }
      const missing = await page.goto(\`/\${locale}/missing-page\`)
      expect(missing?.status()).toBe(notFound)
      await expect(page.locator('html')).toHaveAttribute('lang', tag(locale))
    }
    const response = await page.goto(\`/\${base}/about\`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', tag(base))
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1)
    expect(response?.headers()['content-security-policy']).toContain('sha256-')
    expect(response?.headers()['content-security-policy']).toContain(
      "form-action 'self'"
    )
    expect(response?.headers()['x-content-type-options']).toBe('nosniff')
    const markdown = await request.head(\`/\${base}/about.md\`)
    expect(markdown.headers()['content-type']).toBe(
      'text/markdown; charset=utf-8'
    )
    const unsupported = await request.post(\`/\${base}/about\`)
    expect(unsupported.headers().allow).toBe('GET, HEAD')
    const methodNotAllowed = 405
    expect(unsupported.status()).toBe(methodNotAllowed)
    for (const file of [
      '/robots.txt',
      '/sitemap.xml',
      '/llms.txt',
      '/llms-full.txt',
      \`/\${base}/about.md\`
    ]) {
      const published = await request.get(file)
      expect(published.ok()).toBe(true)
      const body = await published.text()
      expect(body.trim().length).toBeGreaterThan(0)
    }
  })
})
`

export function addProfileBrowserTest({
  profile,
  write,
  stage
}: StagedContext): void {
  if (
    profile.mode !== 'static' &&
    profile.locales === undefined &&
    profile.hasI18n !== false &&
    [
      profile.hasTheme,
      profile.hasFonts,
      profile.hasIcons,
      profile.hasDiagnostics,
      profile.hasSeo
    ].every(flag => flag !== false)
  ) {
    return
  }
  const { locales } = readLocaleSettings(stage)
  const switcher =
    locales.length > 1
      ? `
  const menu = await label(
    'components/molecules/LocaleSwitcher',
    'localeSwitcher_select'
  )
  const name = menu.replace('{code}', base.toUpperCase())
  await page.getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  for (const locale of locales) {
    const names = new Intl.DisplayNames([locale], {
      type: 'language',
      fallback: 'none'
    })
    const item =
      Intl.DisplayNames.supportedLocalesOf(locale).length > 0
        ? (names.of(locale) ?? locale)
        : locale
    await expect(
      page.getByRole('menuitemradio', { name: item, exact: true })
    ).toBeVisible()
  }
  await page.keyboard.press('Escape')`
      : ''
  write({
    file: 'src/tests/pages/Home/Home.profile.production.e2e.test.ts',
    content: `import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'
import { array, object, parse, record, string } from 'valibot'

import { SITE } from '@/constants/site/title.ts'
${profile.mode === 'static' && profile.hasSeo !== false ? "import { LOCALE_TAG_OVERRIDES } from '@/i18n/localeTagOverrides/index.ts'\n" : ''}
const settingsSchema = object({
  baseLocale: string(),
  locales: array(string())
})
const settings = parse(
  settingsSchema,
  JSON.parse(await readFile('project.inlang/settings.json', 'utf8'))
)

const { baseLocale: base${locales.length > 1 || (profile.mode === 'static' && profile.hasSeo !== false) ? ', locales' : ''} } = settings
const schema = record(string(), string())
async function label(folder: string, key: string): Promise<string> {
  const url = new URL(\`../../../\${folder}/i18n/\${base}.json\`, import.meta.url)
  const source = await readFile(url, 'utf8')
  const message = parse(schema, JSON.parse(source))[key]
  if (!message) throw new Error(\`Missing message: \${key}\`)
  return message
}
${
  profile.mode === 'static' && profile.hasSeo !== false
    ? `
const tags: Readonly<Record<string, string>> = LOCALE_TAG_OVERRIDES
const tag = (locale: string) => tags[locale] ?? locale
`
    : ''
}
test('mounts and opens a localized route directly', async ({ page }) => {
  await page.goto(\`/\${base}\`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(SITE.title)${switcher}
  const about = await label('constants/siteLinks', 'siteLinks_aboutLabel')
  await page.getByRole('banner').getByRole('link', { name: about }).click()
  await expect(page).toHaveTitle(\`\${about} | \${SITE.title}\`)
  await page.goto(\`/\${base}/about\`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    \`\${about} \${SITE.title}\`
  )${profile.hasTheme === false ? '' : themeCheck}${profile.hasFonts === false ? '' : fontCheck}
})
${profile.mode === 'static' && profile.hasSeo !== false ? staticPublication : ''}`
  })
}
