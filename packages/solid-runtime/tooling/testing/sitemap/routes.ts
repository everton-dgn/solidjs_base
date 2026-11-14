import { createPublicationController } from '../../../src/infra/server/publication/index.ts'
import { createSitemapRoutes } from '../../../src/seo/sitemap/helpers/sitemapRoutes/index.ts'

export const { index, pages, source, array, inventory } = createSitemapRoutes({
  sources: [],
  publication: createPublicationController(),
  siteUrl: 'https://example.com/',
  usesArtifacts: true
})
