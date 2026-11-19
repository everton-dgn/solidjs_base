import { readdir, readFile } from 'node:fs/promises'

import * as v from 'valibot'

import { hydrationFinished } from '@/tests/helpers/hydrationFinished/index.ts'
import { expect, test } from '@/tests/helpers/pageWatchers/index.ts'
import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'
import { testLanguages } from '@/tests/helpers/testLanguages/index.ts'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const HTTP_REDIRECT = 307
const REQUESTS = 18
const ALTERNATE_LINKS = testLanguages.locales.length + 1
const CatalogSchema = v.record(v.string(), v.string())
const LANGUAGES = testLanguages.locales.map(locale =>
  testLanguages.labels(locale)
)

type PageBody = { catalog: string; message: string }

type BodyTexts = { message: string; texts: string[] }

type TextSearch = { source: string; texts: string[] }

// Messages used only in the body of each page, without parameters or quotes, so
// that they show up literally in the generated JavaScript. The Home comes first.
const PAGE_BODIES: PageBody[] = [
  { catalog: '(home)', message: 'home_features' },
  { catalog: 'about', message: 'about_purpose' },
  { catalog: 'contact', message: 'contact_issues' },
  { catalog: 'privacy', message: 'privacy_preferences' }
]

async function readBodyTexts({
  catalog,
  message
}: PageBody): Promise<BodyTexts> {
  const texts = await Promise.all(
    LANGUAGES.map(async ({ locale }) => {
      const source = await readFile(
        new URL(
          `../../../routes/(base)/${catalog}/i18n/${locale}.json`,
          import.meta.url
        ),
        'utf8'
      )
      const text = v.parse(CatalogSchema, JSON.parse(source))[message]
      if (!text) throw new Error(`Missing ${message} in ${locale}`)
      return text
    })
  )
  return { message, texts }
}

function includesAny({ source, texts }: TextSearch): boolean {
  return texts.some(text => source.includes(text))
}

test('switches language and hydrates when cookie access is blocked', async ({
  page,
  context,
  pageErrors
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        throw new DOMException('Blocked', 'SecurityError')
      },
      set() {
        throw new DOMException('Blocked', 'SecurityError')
      }
    })
  })
  await page.goto(testLanguages.path(testLanguages.base, ''))
  await page
    .getByRole('button', {
      name: testLanguages.labels(testLanguages.base).selector
    })
    .click()
  await page
    .getByRole('menuitemradio', {
      name: testLanguages.labels(testLanguages.third).name,
      exact: true
    })
    .click()
  await expect(page).toHaveURL(testLanguages.path(testLanguages.third, ''))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    testLanguages.labels(testLanguages.third).title
  )
  await page
    .getByRole('button', {
      name: testLanguages.labels(testLanguages.third).theme
    })
    .click()
  await expect(page.getByRole('menu')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('loads each page body only with its route implementation', async ({
  page
}) => {
  const directory = new URL(
    '../../../../.vercel/output/static/assets/',
    import.meta.url
  )
  const entries = await readdir(directory)
  const files = entries.filter(file => file.endsWith('.js'))
  const sources = await Promise.all(
    files.map(async file => ({
      file,
      source: await readFile(new URL(file, directory), 'utf8')
    }))
  )
  const bodies = await Promise.all(PAGE_BODIES.map(body => readBodyTexts(body)))
  // Each body message stays, in the three locales, only in the lazy module of the
  // route. A body imported by the `route` of the page would go into the initial manifest.
  const bodyModules = bodies.map(({ message, texts }) => {
    const modules = sources.filter(({ source }) =>
      includesAny({ source, texts })
    )
    expect(modules, message).toHaveLength(1)
    expect(
      texts.every(text => modules[0]?.source.includes(text)),
      message
    ).toBe(true)
    return modules[0]
  })
  const homeModule = bodyModules[0]?.file
  const requested = new Set<string>()
  page.on('request', request =>
    requested.add(new URL(request.url()).pathname.split('/').pop() ?? '')
  )
  await page.goto(testLanguages.path(testLanguages.alternate, '/404'))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    testLanguages.labels(testLanguages.alternate).missingHeading
  )
  await expect.poll(() => hydrationFinished(page)).toBe(true)
  for (const bodyModule of bodyModules) {
    expect(requested.has(String(bodyModule?.file))).toBe(false)
  }
  await page
    .getByRole('link', {
      name: testLanguages.labels(testLanguages.alternate).home
    })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    testLanguages.labels(testLanguages.alternate).title
  )
  expect(requested.has(String(homeModule))).toBe(true)
})

for (const language of LANGUAGES) {
  test(`renders ${language.locale} in SSR and hydrates without changing its locale`, async ({
    page,
    request,
    pageErrors
  }) => {
    const response = await request.get(
      testLanguages.path(language.locale, ''),
      {
        headers: {
          'accept-language': 'invalid_tag',
          cookie: `locale=${testLanguages.third}`
        }
      }
    )
    expect(response.status()).toBe(HTTP_OK)
    expect(response.headers()['content-language']).toBe(
      testLanguages.header(language.locale)
    )
    const html = await response.text()
    expect(html).toContain(`lang="${language.tag}"`)
    expect(html).toContain(language.title)
    await page.goto(testLanguages.path(language.locale, ''))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      language.title
    )
    await page.getByRole('button', { name: language.selector }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('html')).toHaveAttribute('lang', language.tag)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${readSiteOrigin()}/${language.locale}`
    )
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      ALTERNATE_LINKS
    )
    const header = await page.getByRole('banner').elementHandle()
    const isSameHeader = () =>
      header.evaluate(element => element === document.querySelector('header'))
    await page.getByRole('link', { name: '404', exact: true }).click()
    await expect(page).toHaveURL(testLanguages.path(language.locale, '/404'))
    await expect(page).toHaveTitle(language.missing)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )
    expect(await isSameHeader()).toBe(true)
    await page.getByRole('link', { name: language.home }).click()
    await expect(page).toHaveURL(testLanguages.path(language.locale, ''))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      language.title
    )
    expect(await isSameHeader()).toBe(true)
    expect(pageErrors).toEqual([])
  })
}

test('switches language by keyboard, persists the choice and preserves query and hash', async ({
  page
}) => {
  await page.goto(
    testLanguages.path(testLanguages.alternate, '?campaign=example#section')
  )
  const selector = page.getByRole('button', {
    name: testLanguages.labels(testLanguages.alternate).selector
  })
  await selector.focus()
  await page.keyboard.press('Enter')
  await page
    .getByRole('menuitemradio', {
      name: testLanguages.labels(testLanguages.base).name,
      exact: true
    })
    .focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(
    testLanguages.path(testLanguages.base, '?campaign=example#section')
  )
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    testLanguages.labels(testLanguages.base).title
  )
  await page.goto('/')
  await expect(page).toHaveURL(testLanguages.path(testLanguages.base, ''))
  await page
    .getByRole('button', {
      name: testLanguages.labels(testLanguages.base).selector
    })
    .click()
  await page
    .getByRole('menuitemradio', {
      name: testLanguages.labels(testLanguages.third).name,
      exact: true
    })
    .click()
  await expect(page).toHaveURL(testLanguages.path(testLanguages.third, ''))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    testLanguages.labels(testLanguages.third).title
  )
})

test('negotiates only unprefixed page URLs and does not cache preference redirects', async ({
  request
}) => {
  const response = await request.get('/?q=one', {
    maxRedirects: 0,
    headers: {
      cookie: `locale=${testLanguages.third}`,
      'accept-language': testLanguages.tag(testLanguages.base)
    }
  })
  expect(response.status()).toBe(HTTP_REDIRECT)
  expect(new URL(response.headers().location ?? '').pathname).toBe(
    testLanguages.path(testLanguages.third, '')
  )
  expect(response.headers().location).toContain('?q=one')
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers().vary).toContain('Cookie')
  const fallback = await request.get('/', {
    maxRedirects: 0,
    headers: { cookie: 'locale=invalid', 'accept-language': 'invalid_tag' }
  })
  expect(new URL(fallback.headers().location ?? '').pathname).toBe(
    testLanguages.path(testLanguages.base, '')
  )
  const preferred = await request.head('/', {
    maxRedirects: 0,
    headers: {
      'accept-language': `${testLanguages.third}, ${testLanguages.base};q=0.5`,
      cookie: ''
    }
  })
  expect(new URL(preferred.headers().location ?? '').pathname).toBe(
    testLanguages.path(testLanguages.third, '')
  )
  const missing = await request.get(
    testLanguages.path(testLanguages.base, '/missing')
  )
  expect(missing.status()).toBe(HTTP_NOT_FOUND)
})

for (const { header, locale } of [
  { header: '', locale: testLanguages.base },
  {
    header: `invalid_tag;q=1, ${testLanguages.alternate};q=0`,
    locale: testLanguages.base
  },
  {
    header: `${testLanguages.alternate};q=0.000, ${testLanguages.base};q=0`,
    locale: testLanguages.base
  },
  {
    header: `invalid_tag ; Q = 0, ${testLanguages.alternate} ; q = 0.4`,
    locale: testLanguages.alternate
  },
  {
    header: `invalid_tag;q=NaN, ${testLanguages.alternate};q=0.5`,
    locale: testLanguages.alternate
  }
]) {
  test(`negotiates and persists ${locale} for Accept-Language ${header}`, async ({
    request
  }) => {
    const response = await request.get('/?campaign=example', {
      maxRedirects: 0,
      headers: { 'accept-language': header }
    })
    expect(response.status()).toBe(HTTP_REDIRECT)
    expect(new URL(response.headers().location ?? '').pathname).toBe(
      testLanguages.path(locale, '')
    )
    expect(response.headers().location).toContain('?campaign=example')
    expect(response.headers()['set-cookie']).toContain(`locale=${locale};`)
    expect(response.headers()['cache-control']).toBe('private, no-store')
    const revisit = await request.get('/', {
      maxRedirects: 0,
      headers: { 'accept-language': 'invalid_tag' }
    })
    expect(new URL(revisit.headers().location ?? '').pathname).toBe(
      testLanguages.path(locale, '')
    )
    expect(revisit.headers()['set-cookie']).toBeUndefined()
  })
}

test('isolates concurrent HTML and Markdown requests across all locales', async ({
  request
}) => {
  const formats = ['text/html', 'text/markdown']
  const results = await Promise.all(
    Array.from({ length: REQUESTS }, async (_, index) => {
      const language = LANGUAGES[index % LANGUAGES.length]
      const format =
        formats[Math.floor(index / LANGUAGES.length) % formats.length]
      if (!language || !format) throw new Error('Missing test request')
      const response = await request.get(
        testLanguages.path(language.locale, ''),
        {
          headers: {
            accept: format,
            cookie: `locale=${language.locale === testLanguages.third ? testLanguages.base : testLanguages.third}`
          }
        }
      )
      expect(response.status()).toBe(HTTP_OK)
      expect(response.headers()['content-type']).toContain(format)
      expect(response.headers()['content-language']).toBe(
        testLanguages.header(language.locale)
      )
      expect(response.headers()['set-cookie']).toBe(
        `locale=${language.locale}; Path=/; Max-Age=34560000; SameSite=Lax`
      )
      expect(response.headers()['cache-control']).toBe('private, no-store')
      expect(response.headers().vary?.toLowerCase().split(/,\s*/u)).toContain(
        'cookie'
      )
      return { language, format, body: await response.text() }
    })
  )
  const { texts } = await readBodyTexts({
    catalog: '(home)',
    message: 'home_features'
  })
  for (const { language, format, body } of results) {
    if (format === 'text/html') {
      expect(body).toContain(`lang="${language.tag}"`)
    } else {
      expect(body.split('\n')).toContain(`# ${language.title}`)
    }
    expect(body).toContain(language.title)
    const active = texts[LANGUAGES.indexOf(language)]
    if (!active) throw new Error('Missing localized home text')
    expect(body).toContain(active)
    for (const other of LANGUAGES.filter(
      item => item.locale !== language.locale
    )) {
      const text = texts[LANGUAGES.indexOf(other)]
      if (!text) throw new Error('Missing localized home text')
      if (text !== active) expect(body).not.toContain(text)
    }
  }
})

test('publishes localized sitemap URLs while retaining unprefixed API and asset URLs', async ({
  request
}) => {
  const sitemap = await request.get('/sitemap.xml', { maxRedirects: 0 })
  expect(sitemap.status()).toBe(HTTP_OK)
  expect(sitemap.headers()['set-cookie']).toBeUndefined()
  const xml = await sitemap.text()
  for (const { locale } of LANGUAGES) {
    expect(xml).toContain(`<loc>${readSiteOrigin()}/${locale}</loc>`)
    expect(xml).toContain(`hreflang="${locale}"`)
  }
  const robots = await request.get('/robots.txt', { maxRedirects: 0 })
  expect(robots.status()).toBe(HTTP_OK)
  expect(robots.headers()['set-cookie']).toBeUndefined()
  const image = await request.get('/images/og.png', { maxRedirects: 0 })
  expect(image.headers()['content-type']).toContain('image/png')
  expect(image.headers()['set-cookie']).toBeUndefined()
})
