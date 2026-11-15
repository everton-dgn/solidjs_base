import type { SitemapRouteInfo } from '@evertondgn/solid-runtime/seo/sitemap-types'

import { listCatalog } from '@/infra/server/listCatalog/index.ts'

const sitemap: SitemapRouteInfo = async signal => {
  'use server'
  return listCatalog(signal)
}
export const route = { info: { sitemap } }
export default function Catalog() {
  return <main>Catalog</main>
}
