import { HTTP_OK } from '#solid-runtime/http/constants.ts'
import { createPublicationController } from '#solid-runtime/infra/server/publication/index.ts'

import { SITEMAP_RESPONSE_BYTE_BUDGET } from '../../../constants.ts'
import type { SitemapManifest } from '../../../types.ts'

const manifest: SitemapManifest = { entries: [{ path: '/about' }], sources: [] }

describe('direct sitemap page publication', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('PROD', true)
  })

  it.each([
    { name: 'shared admission', limits: { total: 1 } },
    { name: 'output capacity', limits: { outputs: 1 } },
    {
      name: 'reserved bytes',
      limits: { reservedBytes: SITEMAP_RESPONSE_BYTE_BUDGET }
    }
  ])(
    'rejects pages before preparation when Markdown holds $name',
    async ({ limits }) => {
      const collector = await import('../../collectSitemapEntries/index.ts')
      vi.spyOn(collector, 'collectSitemapEntries').mockReturnValue(manifest)
      const builder = await import('../../buildSitemap/index.ts')
      const build = vi.spyOn(builder, 'buildSitemap')
      const { createSitemapRoutes } = await import('../index.ts')
      const publication = createPublicationController(limits)
      const producer = Promise.withResolvers<Response>()
      const pending = publication.runPublication({
        kind: 'markdown',
        timeoutMs: 1000,
        maxOutputBytes: 1,
        run: () => producer.promise
      })
      try {
        const routes = createSitemapRoutes({
          publication,
          sources: [],
          siteUrl: 'https://example.com'
        })
        const response = await routes.pages({
          request: new Request('https://example.com/sitemaps/pages/1.xml')
        })
        expect({
          status: response.status,
          cache: response.headers.get('cache-control'),
          retry: response.headers.get('retry-after')
        }).toStrictEqual({ status: 503, cache: 'no-store', retry: '1' })
        expect(publication.getMetrics()).toMatchObject({
          active: 1,
          markdown: 1,
          sitemap: 0,
          outputs: 1,
          reservedBytes: 1,
          rejected: 1
        })
        expect(build).not.toHaveBeenCalled()
        await response.body?.cancel()
      } finally {
        producer.resolve(new Response(null))
        await pending
      }
      expect(publication.getMetrics()).toMatchObject({
        active: 0,
        outputs: 0,
        reservedBytes: 0
      })
    }
  )

  it.each(['GET', 'HEAD'])(
    'accounts for direct page output through %s completion',
    async method => {
      const collector = await import('../../collectSitemapEntries/index.ts')
      vi.spyOn(collector, 'collectSitemapEntries').mockReturnValue(manifest)
      const { createSitemapRoutes } = await import('../index.ts')
      const publication = createPublicationController()
      const routes = createSitemapRoutes({
        publication,
        sources: [],
        siteUrl: 'https://example.com'
      })
      const response = await routes.pages({
        request: new Request('https://example.com/sitemaps/pages/1.xml', {
          method
        })
      })
      try {
        expect(response.status).toBe(HTTP_OK)
        expect(response.headers.get('cache-control')).toBe(
          'public, max-age=0, s-maxage=3600, stale-if-error=86400'
        )
        expect(publication.getMetrics()).toMatchObject({
          outputs: method === 'GET' ? 1 : 0,
          reservedBytes: method === 'GET' ? SITEMAP_RESPONSE_BYTE_BUDGET : 0
        })
        const body = await response.text()
        expect(body.includes('/de/about')).toBe(method === 'GET')
        expect(body.length === 0).toBe(method === 'HEAD')
      } finally {
        if (!response.bodyUsed) await response.body?.cancel()
      }
      expect(publication.getMetrics()).toMatchObject({
        active: 0,
        outputs: 0,
        reservedBytes: 0
      })
    }
  )
})
