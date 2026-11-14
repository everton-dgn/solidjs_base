/* oxlint-disable node/no-sync -- The scenario owns these temporary fixtures and inspects each completed build. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import * as v from 'valibot'

import { assertPublicationBuild } from './publication-smoke.ts'
import {
  assertSitemapBuild,
  hasSitemap,
  smokeSitemap
} from './sitemap-smoke.ts'

type Scenario = { app: string; scenario: string }
type Smoke = Scenario & { origin: string; html: string }

const REQUEST_TIMEOUT = 5000
const HTTP_OK = 200
const EXPECTED_GRAPHS = 2

export function assertSeoBuild({ app, scenario }: Scenario): void {
  const hasRobots = existsSync(path.join(app, 'src/routes/robots.txt/index.ts'))
  const files = readdirSync(app).filter(file =>
    file.startsWith('scenario-modules-')
  )
  let clientIds: string[] = []
  const inventories = files.map(file => {
    const source = readFileSync(path.join(app, file), 'utf8')
    const ids = v.parse(v.array(v.string()), JSON.parse(source))
    if (file === 'scenario-modules-client.json') {
      clientIds = ids
      assert.ok(
        !ids.some(id =>
          /seo-robots|\/seo\/(?:createRobots|robotsRoute)\//u.test(id)
        ),
        'Robots entered the client build'
      )
    }
    return ids
  })
  const ids = inventories.flat()
  assert.ok(ids.length > 0)
  assertSitemapBuild({ app, ids, clientIds })
  assertPublicationBuild({ app, ids, clientIds })
  assert.ok(
    !ids.some(id =>
      /schema-dts|markdownPrerender|publicationArtifacts/u.test(id)
    ),
    'Unused publication modules entered the production build'
  )
  if (scenario === 'ssr-plain') {
    assert.ok(
      ids.some(id => id.includes('/seo/createSeo/')),
      'The fixture must exercise runtime createSeo'
    )
    assert.equal(
      ids.some(id => id.includes('/seo/robotsRoute/')),
      hasRobots
    )
  } else if (scenario === 'client-only') {
    assert.ok(
      !ids.some(id => id.includes('/solid-runtime/src/seo/')),
      'Unused SEO entered the production build'
    )
  }
}

export async function smokeSeo({
  app,
  scenario,
  origin,
  html
}: Smoke): Promise<void> {
  await smokeSitemap({ app, scenario, origin })
  if (scenario !== 'ssr-plain') return
  const language = /<html[^>]*lang="(?<language>[^"]+)"/u.exec(html)?.groups
    ?.language
  assert.ok(language)
  for (const pathname of ['/', '/catalog/42']) {
    const response = await fetch(`${origin}${pathname}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })
    assert.equal(response.status, HTTP_OK)
    const body = await response.text()
    const graphs = [
      ...body.matchAll(
        /<script\b[^>]*type="application\/ld\+json"[^>]*>(?<json>[\s\S]*?)<\/script>/gu
      )
    ].map(match => {
      const data: unknown = JSON.parse(match.groups?.json ?? '')
      return data
    })
    assert.equal(graphs.length, EXPECTED_GRAPHS)
    const canonical = new URL(pathname, 'https://scenario.example/').href
    assert.deepEqual(graphs[0], {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': 'https://scenario.example/#website',
          url: 'https://scenario.example/',
          name: 'Scenario application',
          description: 'Independent SEO fixture',
          inLanguage: [language],
          publisher: { '@id': 'https://scenario.example/#organization' }
        },
        {
          '@type': 'WebPage',
          '@id': canonical,
          url: canonical,
          name: 'Scenario page',
          description: 'Independent SEO fixture',
          inLanguage: language,
          isPartOf: { '@id': 'https://scenario.example/#website' },
          image: {
            '@type': 'ImageObject',
            url: 'https://scenario.example/cover.png',
            caption: 'Cover'
          }
        },
        {
          '@type': 'Organization',
          '@id': 'https://scenario.example/#organization',
          name: 'Scenario application',
          description: 'Independent SEO fixture',
          url: 'https://scenario.example/',
          logo: {
            '@type': 'ImageObject',
            url: 'https://scenario.example/logo.png'
          },
          sameAs: []
        }
      ]
    })
    assert.deepEqual(graphs[1], {
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: 'Fixture structured data'
    })
  }
  if (existsSync(path.join(app, 'src/routes/robots.txt/index.ts'))) {
    assert.equal(
      readFileSync(path.join(app, 'src/routes/robots.txt/index.ts'), 'utf8')
        .trim()
        .split('\n').length,
      1
    )
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(`${origin}/robots.txt`, {
        method,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      })
      assert.equal(response.status, HTTP_OK)
      assert.equal(
        response.headers.get('content-type'),
        'text/plain; charset=utf-8'
      )
      assert.equal(
        response.headers.get('cache-control'),
        'public, max-age=0, s-maxage=3600, stale-if-error=86400'
      )
      assert.equal(
        await response.text(),
        method === 'HEAD'
          ? ''
          : `User-agent: *\nAllow: /\nDisallow: /_server\n\nUser-agent: ExampleBot\nDisallow: /archive\n${hasSitemap(app) ? '\nSitemap: https://scenario.example/sitemap.xml\n' : ''}`
      )
    }
  }
}
