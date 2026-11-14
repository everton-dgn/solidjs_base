import { createPublicationController } from '#solid-runtime/infra/server/publication/index.ts'

import { createSitemapRoutes } from '../index.ts'

const MAX_TIMEOUT_MS = 2_147_483_647

describe('sitemap factory timer range', () => {
  it('rejects an overflowing timeout when the routes are created', () => {
    expect(() =>
      createSitemapRoutes({
        publication: createPublicationController(),
        sources: [],
        siteUrl: 'https://example.com',
        timeoutMs: MAX_TIMEOUT_MS + 1
      })
    ).toThrow(
      'Publication timeout must be an integer between 1 and 2147483647 milliseconds'
    )
  })

  it('accepts the maximum supported timeout when the routes are created', () => {
    const routes = createSitemapRoutes({
      publication: createPublicationController(),
      sources: [],
      siteUrl: 'https://example.com',
      timeoutMs: MAX_TIMEOUT_MS
    })
    expect(routes.pages).toBeTypeOf('function')
    expect(routes.index).toBeTypeOf('function')
  })
})
