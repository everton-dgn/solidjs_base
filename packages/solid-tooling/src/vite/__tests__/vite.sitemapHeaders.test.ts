import assert from 'node:assert/strict'
import { it } from 'node:test'

import { staticFilePaths } from '../static-paths.ts'

it('keeps sitemap headers opt-in independently of other publication rules', () => {
  for (const seo of [undefined, false, { sitemap: false }] as const) {
    assert.deepEqual(
      staticFilePaths({ options: { publication: true, seo }, locales: [] }),
      ['/assets/**', '/llms.txt', '/llms-full.txt', '/_markdown/static.json']
    )
  }
  assert.deepEqual(
    staticFilePaths({ options: { seo: { sitemap: true } }, locales: [] }),
    ['/assets/**', '/sitemap.xml', '/sitemaps/pages/**']
  )
})
