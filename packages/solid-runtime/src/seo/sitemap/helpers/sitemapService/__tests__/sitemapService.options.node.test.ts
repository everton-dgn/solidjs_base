import {
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE
} from '#solid-runtime/http/constants.ts'
import { locales } from '#solid-runtime/i18n/locale/index.ts'
import { createPublicationController } from '#solid-runtime/infra/server/publication/index.ts'

import { SITEMAP_URL_LIMIT } from '../../../constants.ts'
import type { SitemapPartitionSource } from '../../../source-types.ts'
import {
  buildSitemapIndexResponse,
  buildSitemapPartResponse
} from '../index.ts'

describe('injected sitemap settings', () => {
  afterEach(() => vi.useRealTimers())

  it('applies the configured cache policy to a single combined sitemap', async () => {
    const response = await buildSitemapIndexResponse({
      publication: createPublicationController(),
      manifest: { entries: [{ path: '/about' }], sources: [] },
      sources: [],
      siteUrl: 'https://example.com',
      signal: new AbortController().signal,
      cacheControl: 'public, max-age=42'
    })
    expect(response.status).toBe(HTTP_OK)
    expect(response.headers.get('cache-control')).toBe('public, max-age=42')
    await expect(response.text()).resolves.toContain('<urlset')
  })

  it('uses the application deadline and retains admission until the source settles', async () => {
    vi.useFakeTimers()
    const publication = createPublicationController({ total: 1 })
    const producer = Promise.withResolvers<never[]>()
    const source = vi.fn<() => Promise<never[]>>(() => producer.promise)
    const timeoutMs = 7
    const response = buildSitemapIndexResponse({
      publication,
      timeoutMs,
      manifest: { entries: [], sources: [source] },
      sources: [],
      siteUrl: 'https://example.com',
      signal: new AbortController().signal
    })
    await vi.advanceTimersByTimeAsync(timeoutMs)
    const result = await response
    expect({
      status: result.status,
      cache: result.headers.get('cache-control'),
      body: await result.text()
    }).toStrictEqual({
      status: HTTP_SERVICE_UNAVAILABLE,
      cache: 'no-store',
      body: ''
    })
    expect(source).toHaveBeenCalledOnce()
    expect(publication.getMetrics()).toMatchObject({
      active: 1,
      sources: 1,
      timedOut: 1
    })
    producer.resolve([])
    await vi.runAllTimersAsync()
    expect(publication.getMetrics()).toMatchObject({
      active: 0,
      sources: 0,
      outputs: 0,
      reservedBytes: 0
    })
  })

  it('rejects a producer ignoring limit with no cache and no partial XML', async () => {
    vi.spyOn(console, 'error').mockReturnValue()
    const count = Math.floor(SITEMAP_URL_LIMIT / locales.length)
    const overflow = 2
    const entries = Array.from({ length: count + overflow }, (_, index) => ({
      path: `/articles/${index}`
    }))
    const readPartition = vi.fn<SitemapPartitionSource['readPartition']>(() =>
      Promise.resolve(entries)
    )
    const result = await buildSitemapPartResponse({
      publication: createPublicationController(),
      manifest: {
        entries: [],
        sources: [],
        dynamicRoutes: [{ path: '/articles/:id', isIndexable: true }]
      },
      matchRoute: () => '/articles/:id',
      sources: [
        {
          id: 'articles',
          routePath: '/articles/:id',
          listPartitions: () => Promise.resolve(['a']),
          readPartition
        }
      ],
      kind: 'source',
      source: 'articles',
      part: 'a',
      siteUrl: 'https://example.com',
      signal: new AbortController().signal
    })
    expect(readPartition).toHaveBeenCalledOnce()
    const options = readPartition.mock.calls[0]?.[0]
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    expect({
      id: options?.id,
      limit: options?.limit,
      aborted: options?.signal.aborted
    }).toStrictEqual({ id: 'a', limit: count + 1, aborted: true })
    expect({
      status: result.status,
      cache: result.headers.get('cache-control'),
      type: result.headers.get('content-type'),
      body: await result.text()
    }).toStrictEqual({
      status: HTTP_SERVICE_UNAVAILABLE,
      cache: 'no-store',
      type: null,
      body: ''
    })
  })
})
