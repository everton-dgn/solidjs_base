import 'server-only'
import { origin } from '@evertondgn/solid-runtime/seo/origin'
import { createSitemapRoutes } from '@evertondgn/solid-runtime/seo/sitemap-routes'
import type { SitemapPartitionSource } from '@evertondgn/solid-runtime/seo/sitemap-types'
import { createPublicationController } from '@evertondgn/solid-runtime/server/publication'

const sources: readonly SitemapPartitionSource[] = [
  {
    id: 'articles',
    routePath: '/articles/:id',
    listPartitions: ({ limit, signal }) => {
      signal.throwIfAborted()
      return Promise.resolve(['first'].slice(0, limit))
    },
    readPartition: ({ id, limit, signal }) => {
      signal.throwIfAborted()
      return Promise.resolve(
        id === 'first'
          ? [{ path: '/articles/42', lastmod: '2026-10-01' }].slice(0, limit)
          : []
      )
    }
  }
]
export const { index, pages, array, source } = createSitemapRoutes({
  publication: createPublicationController(),
  sources,
  siteUrl: origin
})
