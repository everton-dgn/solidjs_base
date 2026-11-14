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
  // Sitemap, robots.txt, llms.txt e as páginas em Markdown recebem os cabeçalhos
  // dos estáticos.
  publication: true,
  seo: { robots: ROBOTS, sitemap: true },
  // Sem fallthrough, um arquivo ausente em /images/ recebe o 404 no-store do
  // Nitro em vez da página SSR com o cache imutável.
  publicAssets: [
    {
      baseURL: '/images',
      dir: 'public/images',
      fallthrough: false,
      maxAge: 31_536_000
    }
  ],
  staticPaths: ['/favicon/**'],
  // No monorepo, o bun.lock, o bunfig.toml e o build do pacote de ferramentas
  // ficam na raiz, fora da pasta da aplicação.
  workspace: {
    dependsOn: ['@evertondgn/solid-tooling#build'],
    // The runtime package is source code outside the application folder, and
    // its manifest holds the exports that resolve each import.
    inputs: [
      'packages/solid-tooling/dist/**',
      'packages/solid-runtime/package.json',
      'packages/solid-runtime/src/**'
    ]
  },
  // One call shares the publication buildId between its plugin and Nitro module.
  async extend({ target }) {
    if (target === 'test') return {}
    const [{ markdownPrerender }, { createPublicationBuild }] =
      await Promise.all([
        import('./tooling/markdownPrerender/index.ts'),
        import('./tooling/publicationArtifacts/helpers/createPublicationBuild/index.ts')
      ])
    const publication = createPublicationBuild()
    return {
      plugins: [publication.plugin],
      nitroModules: [markdownPrerender({ buildId: publication.buildId })]
    }
  }
})
