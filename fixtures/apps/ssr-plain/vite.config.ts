import { SECURITY_HEADERS } from '@evertondgn/solid-runtime/middleware/security-headers/constants'
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

export default defineSolidApp({
  root: import.meta.dirname,
  publication: true,
  seo: {
    sitemap: true,
    robots: {
      sitemapPaths: ['/sitemap.xml'],
      groups: [{ userAgents: ['ExampleBot'], disallow: ['/archive'] }]
    }
  },
  serverSetup: './src/infra/server/configureServerErrors/index.ts',
  securityHeaders: SECURITY_HEADERS,
  middleware: './src/middleware.ts'
})
