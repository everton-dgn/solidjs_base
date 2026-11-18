import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

import { FONTS } from './fonts.ts'
import { ROBOTS } from './src/constants/site/robots.ts'
import { SECURITY_HEADERS } from './src/middleware/securityHeaders/constants.ts'

export default defineSolidApp({
  root: import.meta.dirname,
  fonts: FONTS,
  middleware: './src/middleware/index.ts',
  serverSetup: './src/infra/server/configureServerErrors/index.ts',
  e2e: {
    middleware: './src/tests/fixtures/e2e/middleware/index.ts',
    routes: 'src/tests/fixtures/e2e/routes'
  },
  icons: { 'my-images': './src/assets/images' },
  securityHeaders: SECURITY_HEADERS,
  seo: {
    robots: ROBOTS,
    sitemap: { static: true },
    markdown: { static: true },
    llms: {},
    llmsFull: {}
  },
  // Without fallthrough, a missing file under /images/ gets the no-store 404 of
  // Nitro instead of the SSR page with the immutable cache.
  publicAssets: [
    {
      baseURL: '/images',
      dir: 'public/images',
      fallthrough: false,
      maxAge: 31_536_000
    }
  ],
  staticPaths: ['/favicon/**'],
  // In the monorepo, bun.lock, bunfig.toml and the build of the tooling and icons
  // packages live at the root, outside the application folder.
  workspace: {
    dependsOn: [
      '@evertondgn/solid-tooling#build',
      '@evertondgn/vite-plugin-solid-icons#build'
    ],
    // The runtime package is source code outside the application folder, and
    // its manifest holds the exports that resolve each import.
    inputs: [
      'packages/solid-tooling/dist/**',
      'packages/vite-plugin-solid-icons/dist/**',
      'packages/solid-runtime/package.json',
      'packages/solid-runtime/src/**'
    ]
  }
})
