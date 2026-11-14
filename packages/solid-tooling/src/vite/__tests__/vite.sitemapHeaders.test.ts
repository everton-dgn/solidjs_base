import assert from 'node:assert/strict'
import { it } from 'node:test'

import { staticFilePaths } from '../static-paths.ts'

it('keeps sitemap headers opt-in independently of other publication rules', () => {
  assert.deepEqual(staticFilePaths({ options: { seo: false }, locales: [] }), [
    '/assets/**'
  ])
  for (const sitemap of [undefined, false] as const) {
    assert.deepEqual(
      staticFilePaths({
        options: {
          seo: { sitemap, markdown: { static: true }, llms: {}, llmsFull: {} }
        },
        locales: []
      }),
      [
        '/assets/**',
        '/**.md',
        '/llms.txt',
        '/llms-full.txt',
        '/_markdown/static.json'
      ]
    )
  }
  assert.deepEqual(
    staticFilePaths({ options: { seo: { sitemap: true } }, locales: [] }),
    ['/assets/**', '/sitemap.xml', '/sitemaps/pages/**']
  )
})
