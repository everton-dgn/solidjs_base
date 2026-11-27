import { expect, test } from '@playwright/test'

import { readSiteOrigin } from '@/tests/helpers/readSiteOrigin/index.ts'
import { testLanguages } from '@/tests/helpers/testLanguages/index.ts'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
// Entries published by the source of `blog/[slug]`.
const BLOG_ENTRIES = 2
const HOME_TITLE = testLanguages.labels(testLanguages.base).pageTitle
const SITE_DESCRIPTION = testLanguages.labels(
  testLanguages.base
).siteDescription

test.describe('indexes generated from the route manifest', () => {
  for (const method of ['GET', 'HEAD']) {
    test(`refuses ${method} of an existing partition without the XML suffix`, async ({
      request
    }) => {
      const canonical = await request.fetch('/sitemaps/catalog/a.xml', {
        method,
        maxRedirects: 0
      })
      expect(canonical.status()).toBe(HTTP_OK)
      const invalid = await request.fetch('/sitemaps/catalog/a', {
        method,
        maxRedirects: 0
      })
      expect(invalid.status()).toBe(HTTP_NOT_FOUND)
      expect(invalid.headers()['cache-control']).toBe('no-store')
      expect(await invalid.body()).toHaveLength(0)
    })
  }

  test('generates sitemap, robots and llms.txt from the route manifest', async ({
    request
  }) => {
    const siteUrl = readSiteOrigin()
    const baseUrl = (suffix: string) =>
      siteUrl + testLanguages.path(testLanguages.base, suffix)
    const alternateUrl = (suffix: string) =>
      siteUrl + testLanguages.path(testLanguages.alternate, suffix)
    const cacheControl =
      'public, max-age=0, s-maxage=3600, stale-if-error=86400'

    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(HTTP_OK)
    expect(sitemap.headers()['content-type']).toContain('application/xml')
    expect(sitemap.headers()['cache-control']).toBe(cacheControl)
    const index = await sitemap.text()
    expect(index).toContain('<sitemapindex')
    expect(index).toContain(`${siteUrl}/sitemaps/catalog/a.xml`)
    const parts = [...index.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)]
    const bodies = await Promise.all(
      parts.map(async match => {
        const location = new URL(String(match.groups?.url))
        expect(location.origin).toBe(siteUrl)
        const response = await request.get(location.pathname)
        expect(response.status()).toBe(HTTP_OK)
        return response.text()
      })
    )
    const alternateLink = testLanguages.hasPrefix ? '<xhtml:link' : '</url>'
    const xml = bodies.join('\n')
    expect(xml).toContain(`<loc>${alternateUrl('/catalog/a-1')}</loc>`)
    const missingPart = await request.get('/sitemaps/catalog/removed.xml')
    expect(missingPart.status()).toBe(HTTP_NOT_FOUND)
    expect(missingPart.headers()['cache-control']).toBe('no-store')
    // Static parts outside the manifest stay 404, without a negative cache.
    const missingPage = await request.get('/sitemaps/pages/9999.xml')
    expect(missingPage.status()).toBe(HTTP_NOT_FOUND)
    expect(missingPage.headers()['cache-control']).toBe('no-store')
    const inventory = await request.get('/sitemaps/static.json', {
      headers: { 'x-nitro-prerender': '/sitemaps/static.json' }
    })
    expect(inventory.status()).toBe(HTTP_NOT_FOUND)
    expect(xml).toContain(`<loc>${alternateUrl('')}</loc>`)
    expect(xml).toContain(`<loc>${alternateUrl('/backend-error')}</loc>`)
    expect(xml).toContain(`<loc>${alternateUrl('/seo-public')}</loc>`)
    expect(xml).toContain(`<loc>${alternateUrl('/seo-sitemap-only')}</loc>`)
    expect(xml).toContain(
      `<url><loc>${alternateUrl('/seo-article')}</loc><lastmod>2026-09-21</lastmod>${alternateLink}`
    )
    expect(xml).toContain(`<url><loc>${alternateUrl('')}</loc>${alternateLink}`)
    // Source of `blog/[slug]`: normalized trailing slash and the invalid date left out.
    expect(xml).toContain(
      `<url><loc>${alternateUrl('/blog/first-post')}</loc><lastmod>2026-09-10</lastmod>${alternateLink}`
    )
    expect(xml).toContain(
      `<url><loc>${alternateUrl('/blog/second-post')}</loc>${alternateLink}`
    )
    expect(xml).not.toContain('yesterday')
    expect(xml).not.toContain('/private')
    expect(xml).not.toContain('/seo-noindex')
    expect(xml).not.toContain('404')

    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(HTTP_OK)
    expect(robots.headers()['content-type']).toContain('text/plain')
    expect(robots.headers()['cache-control']).toBe(cacheControl)

    const llms = await request.get('/llms.txt')
    expect(llms.status()).toBe(HTTP_OK)
    const markdown = await llms.text()
    expect(markdown.startsWith('# ')).toBe(true)
    expect(markdown).toContain(
      `> ${SITE_DESCRIPTION}\n\n- ${testLanguages.availability}\n`
    )
    expect(markdown.indexOf(`- ${testLanguages.availability}`)).toBeLessThan(
      markdown.indexOf('## ')
    )
    const useCases = markdown.split('## When to use\n\n')[1]?.split('\n## ')[0]
    expect(useCases).toContain(`](${baseUrl('/index.md')}): `)
    expect(useCases).toContain(`](${baseUrl('/about.md')}): `)
    expect(markdown.indexOf('## When to use\n')).toBeLessThan(
      markdown.indexOf('## Pages\n')
    )
    expect(markdown).toContain(
      `- [${HOME_TITLE}](${baseUrl('/index.md')}): ${SITE_DESCRIPTION}\n`
    )
    expect(markdown).toContain(
      `## Guides\n\n- [Public guide](${baseUrl('/seo-public')}): Public content of the guide.\n`
    )
    expect(markdown).toContain(
      `## Optional\n\n- [Backend data](${baseUrl('/backend-error')}): Test page for the backend response states.\n`
    )
    expect(markdown.indexOf('## Optional')).toBeGreaterThan(
      markdown.indexOf('## Guides')
    )
    const sitemapUrls = [...xml.matchAll(/<loc>(?<url>[^<]+)<\/loc>/gu)].map(
      match => match.groups?.url
    )
    const indexedPages = markdown.slice(markdown.indexOf('## Pages\n'))
    const llmsUrls = [
      ...indexedPages.matchAll(/^- \[[^\]]+\]\((?<url>[^)]+)\)/gmu)
    ].map(match => match.groups?.url)
    const markdownUrls = new Map([
      [baseUrl(''), baseUrl('/index.md')],
      [baseUrl('/about'), baseUrl('/about.md')],
      [baseUrl('/contact'), baseUrl('/contact.md')],
      [baseUrl('/privacy'), baseUrl('/privacy.md')]
    ])
    // Indexable pages without `route.info.llms`: only in the sitemap.
    const sitemapOnly = new Set([
      baseUrl('/seo-sitemap-only'),
      baseUrl('/seo-article'),
      baseUrl('/structured-data-stream'),
      baseUrl('/fragment-css'),
      baseUrl('/markdown-optout')
    ])
    expect(new Set(llmsUrls)).toStrictEqual(
      new Set([
        ...sitemapUrls
          .filter(
            url =>
              String(url).startsWith(baseUrl('')) &&
              !sitemapOnly.has(String(url)) &&
              !String(url).startsWith(baseUrl('/blog/')) &&
              !String(url).startsWith(baseUrl('/catalog/'))
          )
          .map(url => markdownUrls.get(String(url)) ?? url),
        `${siteUrl}/llms-full.txt`
      ])
    )
    // A source entry with a wrong path would only show up in Search Console. The
    // URLs use the public origin; the test server answers by the path.
    const blogPaths = sitemapUrls
      .map(url => String(url).slice(siteUrl.length))
      .filter(path =>
        path.startsWith(testLanguages.path(testLanguages.alternate, '/blog/'))
      )
    expect(blogPaths).toHaveLength(BLOG_ENTRIES)
    for (const path of blogPaths) {
      const page = await request.get(path)
      expect(page.status(), path).toBe(HTTP_OK)
    }
    expect(new Set(llmsUrls).size).toBe(llmsUrls.length)
    expect(markdown).not.toContain('/seo-sitemap-only')
    expect(markdown).not.toContain('/structured-data-stream')
    expect(markdown).not.toContain('/seo-noindex')
    expect(markdown).not.toContain('404')
  })
})
