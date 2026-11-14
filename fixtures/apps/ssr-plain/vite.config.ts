import { SECURITY_HEADERS } from '@evertondgn/solid-runtime/middleware/security-headers/constants'
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

export default defineSolidApp({
  root: import.meta.dirname,
  fonts: [
    {
      family: 'Scenario Font',
      files: [
        {
          path: 'src/assets/scenario.woff2',
          weight: 400,
          unicodeRange: 'U+0041',
          preload: true
        }
      ]
    }
  ],
  seo: {
    robots: { groups: [{ userAgents: ['ExampleBot'], disallow: ['/archive'] }] }
  },
  serverSetup: './src/infra/server/configureServerErrors/index.ts',
  securityHeaders: SECURITY_HEADERS,
  middleware: './src/middleware.ts'
})
