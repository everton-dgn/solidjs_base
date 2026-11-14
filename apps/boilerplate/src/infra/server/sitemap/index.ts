import 'server-only'
import { origin } from '@evertondgn/solid-runtime/seo/origin'
import { createSitemapRoutes } from '@evertondgn/solid-runtime/seo/sitemap-routes'

import { publication } from '@/infra/server/publication/index.ts'
import { sitemapSources } from '@/infra/server/sitemapSources/index.ts'

export const { index, pages, source, array, inventory } = createSitemapRoutes({
  sources: sitemapSources,
  publication,
  siteUrl: new URL('/', origin).href,
  usesArtifacts: true
})
