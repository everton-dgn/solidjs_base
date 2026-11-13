import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

import { SECURITY_HEADERS } from './src/middleware/securityHeaders/constants.ts'

export default defineSolidApp({
  root: import.meta.dirname,
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
    inputs: ['packages/solid-tooling/dist/**']
  },
  // O i18n e a publicação ainda ficam na aplicação. Uma chamada só entrega o
  // plugin e o módulo do Nitro com o mesmo buildId.
  async extend({ target }) {
    const { i18nPlugin } = await import('./tooling/i18n/i18nPlugin/index.ts')
    if (target === 'test') return { plugins: [i18nPlugin()] }
    const [{ markdownPrerender }, { createPublicationBuild }] =
      await Promise.all([
        import('./tooling/markdownPrerender/index.ts'),
        import('./tooling/publicationArtifacts/helpers/createPublicationBuild/index.ts')
      ])
    const publication = createPublicationBuild()
    return {
      plugins: [publication.plugin, i18nPlugin()],
      nitroModules: [markdownPrerender({ buildId: publication.buildId })]
    }
  }
})
