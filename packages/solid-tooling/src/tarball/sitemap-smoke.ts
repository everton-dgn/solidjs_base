/* oxlint-disable node/no-sync -- Inspect completed builds owned by the scenario. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

type Build = { app: string; ids: string[]; clientIds: string[] }
type Smoke = { app: string; scenario: string; origin: string }
const REQUEST_TIMEOUT = 5000
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

export function hasSitemap(app: string): boolean {
  return existsSync(path.join(app, 'src/routes/sitemap.xml/index.ts'))
}

export function assertSitemapBuild({ app, ids, clientIds }: Build): void {
  const enabled = hasSitemap(app)
  assert.equal(
    ids.some(id => id.includes('/seo/sitemap/')),
    enabled,
    'Disabled sitemap must not contain any sitemap service module'
  )
  assert.ok(
    !clientIds.some(id =>
      /\/seo\/sitemap\/|\/infra\/server\/(?:sitemap|listCatalog|publication)\//u.test(
        id
      )
    ),
    'Sitemap services, sources and publication controller must stay on the server'
  )
  if (!existsSync(path.join(app, '.vercel/output/config.json'))) return
  const config = readFileSync(
    path.join(app, '.vercel/output/config.json'),
    'utf8'
  )
  assert.equal(
    config.includes('sitemap'),
    enabled,
    'Static sitemap header rules must follow the sitemap option'
  )
}

export async function smokeSitemap({
  app,
  scenario,
  origin
}: Smoke): Promise<void> {
  if (scenario === 'client-only') return
  const enabled = hasSitemap(app)
  const paths = [
    '/sitemap.xml',
    '/sitemaps/pages/1.xml',
    '/sitemaps/array.xml',
    '/sitemaps/articles/first.xml'
  ]
  for (const pathname of paths) {
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(`${origin}${pathname}`, {
        method,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      })
      const body = await response.text()
      if (!enabled) {
        assert.notEqual(
          response.headers.get('content-type'),
          'application/xml; charset=utf-8'
        )
        continue
      }
      assert.equal(response.status, HTTP_OK, pathname)
      assert.equal(
        response.headers.get('content-type'),
        'application/xml; charset=utf-8'
      )
      assert.equal(
        response.headers.get('cache-control'),
        'public, max-age=0, s-maxage=3600, stale-if-error=86400'
      )
      if (method === 'HEAD') {
        assert.equal(body, '')
        continue
      }
      if (pathname === '/sitemap.xml') {
        for (const part of paths.slice(1)) {
          assert.ok(body.includes(`https://scenario.example${part}`), part)
        }
        continue
      }
      let entry = '/articles/42'
      if (pathname.includes('pages')) entry = '/about'
      if (pathname.includes('array')) entry = '/catalog/42'
      if (scenario === 'ssr-i18n') {
        for (const locale of ['fr', 'de', 'it', 'ja']) {
          assert.ok(
            body.includes(
              `<loc>https://scenario.example/${locale}${entry}</loc>`
            )
          )
          assert.ok(body.includes(`hreflang="${locale}"`))
        }
        assert.ok(
          body.includes(
            'hreflang="x-default" href="https://scenario.example/fr'
          )
        )
      } else {
        assert.ok(body.includes(`<loc>https://scenario.example${entry}</loc>`))
        assert.ok(!body.includes('xhtml:link'))
        assert.ok(!body.includes('hreflang='))
      }
    }
  }
  if (!enabled) return
  for (const pathname of [
    '/sitemaps/pages/1',
    '/sitemaps/articles/first',
    '/sitemaps/articles/missing.xml'
  ]) {
    const response = await fetch(`${origin}${pathname}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })
    assert.equal(response.status, HTTP_NOT_FOUND)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(await response.text(), '')
  }
}
