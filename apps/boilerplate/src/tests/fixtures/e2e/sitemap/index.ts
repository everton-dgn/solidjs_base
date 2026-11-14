import { origin } from '@evertondgn/solid-runtime/seo/origin'
import { createSitemapRoutes } from '@evertondgn/solid-runtime/seo/sitemap-routes'

import { publication } from '@/infra/server/publication/index.ts'
import { fixtureSitemapSources } from '@/tests/fixtures/e2e/sitemapSources/index.ts'

export const { index, pages, source, array, inventory } = createSitemapRoutes({
  sources: fixtureSitemapSources,
  publication,
  siteUrl: new URL('/', origin).href,
  usesArtifacts: true
})
