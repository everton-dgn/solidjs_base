import { m } from '@paraglide/messages.js'
import { expect, type Page, test } from '@playwright/test'

import { SITE } from '@/constants/site/title.ts'
import {
  parseStructuredData,
  type StructuredData
} from '@/tests/helpers/parseStructuredData/index.ts'
import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'
import { testLanguages } from '@/tests/helpers/testLanguages/index.ts'

test.use({ locale: testLanguages.tag(testLanguages.alternate) })

const HTTP_OK = 200
const SITE_TITLE = SITE.title
const options = { locale: testLanguages.alternate }
const HOME_TITLE = m.home_seoTitle({}, { locale: testLanguages.alternate })
const SITE_DESCRIPTION = m.site_description(
  {},
  { locale: testLanguages.alternate }
)
const SITE_IMAGE_ALT = m.site_imageAlt({}, { locale: testLanguages.alternate })
const ROBOTS_INDEX = 'index, follow, max-image-preview:large'
const SOCIAL_TAGS = 'head meta[property^="og:"], head meta[name^="twitter:"]'
// Base graph of createSeo plus the own script of the page.
const SCRIPTS_WITH_PAGE_DATA = 2
// WebSite, page and Organization; the order does not matter in JSON-LD.
const BASE_GRAPH_NODES = 3

// Only the fields that identify each node; the full format is covered by the
// unit tests of `buildStructuredData`.
async function readStructuredData(
  page: Page
): Promise<StructuredData['@graph']> {
  const json = await page
    .locator('head script[type="application/ld+json"]')
    .textContent()
  return parseStructuredData(json)['@graph']
}

function readServerScripts(html: string): string[] {
  const head = html.split('</head>')[0] ?? ''
  return [
    ...head.matchAll(
      /<script\b[^>]*type="application\/ld\+json"[^>]*>(?<json>[\s\S]*?)<\/script>/gu
    )
  ].map(match => match.groups?.json ?? '')
}

test.describe('SEO metadata', () => {
  test('publishes canonical, Open Graph and the social image per route', async ({
    page
  }) => {
    const siteUrl = readSiteOrigin()
    await page.goto('/')
    await expect(page).toHaveTitle(HOME_TITLE)
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      SITE_DESCRIPTION
    )
    await expect(
      page.locator('head meta[property="og:title"]')
    ).toHaveAttribute('content', HOME_TITLE)

    const canonical = page.locator('head link[rel="canonical"]')
    await expect(canonical).toHaveAttribute(
      'href',
      `${siteUrl}${testLanguages.path(testLanguages.alternate, '')}`
    )
    const describedBy = page.locator('head link[rel="describedby"]')
    await expect(describedBy).toHaveAttribute('href', '/llms.txt')
    await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute(
      'content',
      `${siteUrl}${testLanguages.path(testLanguages.alternate, '')}`
    )
    await expect(
      page.locator('head meta[property="og:image"]')
    ).toHaveAttribute('content', `${siteUrl}/images/og.png`)
    await expect(
      page.locator('head meta[name="twitter:card"]')
    ).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('head meta[property="og:type"]')).toHaveCount(1)
    await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute(
      'content',
      'website'
    )
    await expect(
      page.locator('head meta[name="twitter:image:alt"]')
    ).toHaveAttribute('content', SITE_IMAGE_ALT)
    await expect(
      page.locator('head script[type="application/ld+json"]')
    ).toHaveCount(1)
    const graph = await readStructuredData(page)
    const logoNode = expect.objectContaining({
      url: `${siteUrl}/favicon/apple-touch-icon.png`
    })
    const baseNodes = [
      { '@type': 'WebSite', url: `${siteUrl}/`, name: SITE_TITLE },
      {
        '@type': 'WebPage',
        url: `${siteUrl}${testLanguages.path(testLanguages.alternate, '')}`,
        name: HOME_TITLE
      },
      {
        '@type': 'Organization',
        url: `${siteUrl}/`,
        name: SITE_TITLE,
        description: SITE_DESCRIPTION,
        logo: logoNode
      }
    ].map(node => expect.objectContaining(node))
    expect(graph).toHaveLength(BASE_GRAPH_NODES)
    expect(graph).toEqual(expect.arrayContaining(baseNodes))
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      ROBOTS_INDEX
    )

    const image = await page.request.get('/images/og.png')
    expect(image.status()).toBe(HTTP_OK)
    expect(image.headers()['content-type']).toContain('image/png')
    const logo = await page.request.get('/favicon/apple-touch-icon.png')
    expect(logo.status()).toBe(HTTP_OK)

    await page.getByRole('link', { name: '404', exact: true }).click()
    await expect(
      page.getByRole('heading', {
        name: m.errorFallback_notFoundTitle({}, options)
      })
    ).toBeVisible()
    await expect(page).toHaveTitle(m.notFound_title({}, options))
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      m.notFound_description({}, options)
    )
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )
    await expect(canonical).toHaveCount(0)
    await expect(page.locator(SOCIAL_TAGS)).toHaveCount(0)
    await expect(
      page.locator('head script[type="application/ld+json"]')
    ).toHaveCount(0)

    await page
      .getByRole('link', {
        name: m.siteLinks_homeLabel({}, options),
        exact: true
      })
      .click()
    await expect(canonical).toHaveAttribute(
      'href',
      `${siteUrl}${testLanguages.path(testLanguages.alternate, '')}`
    )
    await expect(page).toHaveTitle(HOME_TITLE)
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      'content',
      SITE_DESCRIPTION
    )
    await expect(
      page.locator('head meta[property="og:title"]')
    ).toHaveAttribute('content', HOME_TITLE)
    await expect(
      page.locator('head meta[name="twitter:description"]')
    ).toHaveAttribute('content', SITE_DESCRIPTION)
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      ROBOTS_INDEX
    )
    await expect(
      page.locator('head script[type="application/ld+json"]')
    ).toHaveCount(1)
    expect(await readStructuredData(page)).toContainEqual(
      expect.objectContaining({
        '@type': 'WebPage',
        url: `${siteUrl}${testLanguages.path(testLanguages.alternate, '')}`
      })
    )
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('publishes noindex in the HTML of a static route without depending on JavaScript', async ({
      page
    }) => {
      await page.goto('/seo-noindex')
      await expect(page).toHaveTitle('Utility page')
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex'
      )
    })
  })
})

test.describe('structured data', () => {
  test('publishes the type, image and JSON-LD declared by the route', async ({
    page
  }) => {
    const siteUrl = readSiteOrigin()
    await page.goto('/seo-article')

    await expect(page).toHaveTitle('Sample article')
    await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute(
      'content',
      'article'
    )
    await expect(
      page.locator('head meta[property="og:image"]')
    ).toHaveAttribute('content', `${siteUrl}/favicon/apple-touch-icon.png`)
    await expect(
      page.locator('head meta[name="twitter:image"]')
    ).toHaveAttribute('content', `${siteUrl}/favicon/apple-touch-icon.png`)
    await expect(
      page.locator('head meta[property="og:image:alt"]')
    ).toHaveAttribute('content', 'Cover of the sample article')
    await expect(
      page.locator('head meta[property="og:image:width"]')
    ).toHaveAttribute('content', '180')
    await expect(
      page.locator('head meta[property="article:published_time"]')
    ).toHaveAttribute('content', '2026-09-01')
    await expect(
      page.locator('head meta[property="article:modified_time"]')
    ).toHaveAttribute('content', '2026-09-21')
    expect(await readStructuredData(page)).toContainEqual(
      expect.objectContaining({
        '@type': 'Article',
        url: `${siteUrl}${testLanguages.path(testLanguages.alternate, '/seo-article')}`,
        name: 'Sample article',
        datePublished: '2026-09-01',
        dateModified: '2026-09-21',
        publisher: { '@id': `${siteUrl}/#organization` }
      })
    )

    await page
      .getByRole('link', {
        name: m.siteLinks_homeLabel({}, options),
        exact: true
      })
      .click()
    await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute(
      'content',
      'website'
    )
    await expect(page.locator('head meta[property^="article:"]')).toHaveCount(0)
  })

  test('publishes the own JSON-LD of the page next to the base graph', async ({
    page,
    request
  }) => {
    const response = await request.get('/structured-data')
    expect(response.status()).toBe(HTTP_OK)
    const serverScripts = readServerScripts(await response.text())
    expect(serverScripts).toHaveLength(SCRIPTS_WITH_PAGE_DATA)
    expect(
      serverScripts.filter(text => text.includes('"@type":"FAQPage"'))
    ).toHaveLength(1)

    await page.goto('/structured-data')

    const scripts = page.locator('head script[type="application/ld+json"]')
    await expect(scripts).toHaveCount(SCRIPTS_WITH_PAGE_DATA)
    const texts = await scripts.allTextContents()
    expect(
      texts.filter(text => text.includes('"@type":"WebSite"'))
    ).toHaveLength(1)
    expect(
      texts.filter(text => text.includes('"@type":"FAQPage"'))
    ).toHaveLength(1)

    await page
      .getByRole('link', {
        name: m.siteLinks_homeLabel({}, options),
        exact: true
      })
      .click()
    await expect(page).toHaveTitle(HOME_TITLE)
    await expect(scripts).toHaveCount(1)
    const remaining = await scripts.allTextContents()
    expect(remaining.filter(text => text.includes('FAQPage'))).toHaveLength(0)
  })
})
