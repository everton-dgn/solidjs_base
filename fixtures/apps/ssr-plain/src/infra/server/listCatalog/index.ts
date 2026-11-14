import 'server-only'
import type { SitemapRouteInfo } from '@evertondgn/solid-runtime/seo/sitemap-types'

export const listCatalog: SitemapRouteInfo = signal => {
  signal.throwIfAborted()
  return [{ path: '/catalog/42', lastmod: '2026-10-02' }]
}
