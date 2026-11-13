import { env, loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import { fmt } from '@evertondgn/solid-tooling/fmt'
import { lint } from '@evertondgn/solid-tooling/lint'
import { solidTest } from '@evertondgn/solid-tooling/vitest'
import { defineConfig, lazyPlugins, loadEnv } from 'vite-plus'

import inlangSettings from './project.inlang/settings.json' with { type: 'json' }
import { SECURITY_HEADERS } from './src/middleware/securityHeaders/constants.ts'

type WorkspaceInput = { pattern: string; base: 'workspace' }

// No monorepo, o bun.lock, o bunfig.toml e o build do pacote de ferramentas
// ficam na raiz, fora da pasta da aplicação.
function fromWorkspace(pattern: string): WorkspaceInput {
  return { pattern, base: 'workspace' }
}

const WORKSPACE_INPUTS = [
  fromWorkspace('bun.lock'),
  fromWorkspace('bunfig.toml'),
  fromWorkspace('packages/solid-tooling/dist/**')
]
const TOOLING_BUILD = '@evertondgn/solid-tooling#build'
// As entradas explícitas mantêm o cache do lint de CSS independente do
// rastreamento das leituras feitas pelo runtime em cada sistema operacional.
const CSS_CACHE_INPUTS = [
  'src/**/*.css',
  'tooling/css/**',
  'package.json',
  ...WORKSPACE_INPUTS
]
// O lint e o check dependem da tarefa lint-css, que cuida do CSS. As entradas
// explícitas cobrem as declarações que o lint e o formatador ignoram, as
// configurações do TS e as dependências instaladas.
const PROJECT_CHECK_INPUTS = [
  { auto: true },
  'src/**',
  'paraglide/**',
  'tooling/**',
  '*.ts',
  'tsconfig*.json',
  'package.json',
  'patches/**',
  ...WORKSPACE_INPUTS
]
const STATIC_FILE_HEADERS = {
  'strict-transport-security': SECURITY_HEADERS['strict-transport-security'],
  'x-content-type-options': SECURITY_HEADERS['x-content-type-options'],
  'cross-origin-resource-policy':
    SECURITY_HEADERS['cross-origin-resource-policy']
}
// O Nitro compila as routeRules com o preMerge do h3, que recusa sobreposição
// parcial: um /**.md cruzaria os diretórios abaixo e a compilação voltaria ao
// modo simples com aviso. Os .md publicados ficam sob o prefixo de idioma do
// urlPatterns em project.inlang/paraglide.config.ts.
const STATIC_FILE_PATHS = [
  '/assets/**',
  '/images/**',
  '/favicon/**',
  ...inlangSettings.locales.map(locale => `/${locale}/**.md`),
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/sitemaps/pages/**',
  '/_markdown/static.json'
]
const TOOLING_CI_TEST_WORKERS = 3
const TOOLING_TEST_CONCURRENCY = env.CI
  ? ` --test-concurrency=${TOOLING_CI_TEST_WORKERS}`
  : ''

// Os plugins do Vite só são importados quando o Vite roda de fato. vp lint,
// fmt, check, staged e o tooling do editor leem a config sem pagar esse custo
// nem receber os logs de inicialização do Nitro no stdout.
const loadComponentModules = async () => {
  const [solidModule, routing, iconsModule, loaders, i18n] = await Promise.all([
    import('@solidjs/vite-plugin'),
    import('filesystem-routing/vite'),
    import('unplugin-icons/vite'),
    import('unplugin-icons/loaders'),
    import('./tooling/i18n/i18nPlugin/index.ts')
  ])
  return {
    solid: solidModule.default,
    fileRoutes: routing.fileRoutes,
    Icons: iconsModule.default,
    FileSystemIconLoader: loaders.FileSystemIconLoader,
    i18n: i18n.i18nPlugin
  }
}

type ComponentModules = Awaited<ReturnType<typeof loadComponentModules>>

const icons = ({ Icons, FileSystemIconLoader }: ComponentModules) =>
  Icons({
    compiler: 'solid',
    iconCustomizer(_collection, _icon, props) {
      props['aria-hidden'] = 'true'
    },
    customCollections: {
      'my-images': FileSystemIconLoader('./src/assets/images')
    }
  })

const componentPlugins = () =>
  lazyPlugins(async () => {
    const modules = await loadComponentModules()
    return [
      modules.i18n(),
      icons(modules),
      modules.solid({ serverFunctions: true }),
      modules.fileRoutes({ types: 'src/@types/routes.d.ts', httpMethods: true })
    ]
  })

const appPlugins = (mode: string) =>
  lazyPlugins(async () => {
    const [
      modules,
      { nitro },
      { markdownPrerender },
      { createPublicationBuild }
    ] = await Promise.all([
      loadComponentModules(),
      import('nitro/vite'),
      import('./tooling/markdownPrerender/index.ts'),
      import('./tooling/publicationArtifacts/helpers/createPublicationBuild/index.ts')
    ])
    // O Nitro compartilha esta lista de plugins entre os ambientes do build, e
    // o mesmo closure chega ao SSR e ao módulo que grava o manifesto.
    const { buildId, plugin: publicationBuild } = createPublicationBuild()
    return [
      publicationBuild,
      modules.i18n(),
      icons(modules),
      modules.solid({
        start: {
          middleware:
            mode === 'e2e'
              ? './src/tests/fixtures/e2e/middleware/index.ts'
              : './src/middleware/index.ts'
        },
        ssr: true,
        serverFunctions: {
          serverSetup: './src/infra/server/configureServerErrors/index.ts'
        }
      }),
      modules.fileRoutes(
        mode === 'e2e'
          ? { dir: 'src/tests/fixtures/e2e/routes', httpMethods: true }
          : { types: 'src/@types/routes.d.ts', httpMethods: true }
      ),
      // A função da Vercel usa o Node de engines.node. O SSR mantém Node até
      // Bun preservar os contratos de Response e do log de falhas.
      nitro({
        serverEntry: false,
        preset: 'vercel',
        modules: [markdownPrerender({ buildId })],
        // Sem fallthrough, um arquivo ausente em /images/ recebe o 404 no-store
        // do Nitro em vez da página SSR com o cache imutável. O Nitro já
        // registra assim o assetsDir do Vite, que serve /assets/.
        publicAssets: [
          {
            baseURL: '/images',
            dir: 'public/images',
            fallthrough: false,
            maxAge: 31_536_000
          }
        ],
        // Os estáticos saem do CDN sem passar pelo middleware. Os mesmos
        // valores chegam às respostas da função, que o middleware já grava.
        routeRules: Object.fromEntries(
          STATIC_FILE_PATHS.map(path => [
            path,
            { headers: STATIC_FILE_HEADERS }
          ])
        )
      })
    ]
  })

function loadTestEnvFile(): void {
  try {
    loadEnvFile(fileURLToPath(new URL('.env.test', import.meta.url)))
  } catch (error) {
    const isMissing =
      error instanceof Error && 'code' in error && error.code === 'ENOENT'
    if (!isMissing) throw error
  }
}

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, import.meta.dirname, ['HOST', 'PORT'])
  const server = {
    host: localEnv.HOST,
    port: localEnv.PORT ? Number(localEnv.PORT) : undefined
  }

  if (mode === 'test') {
    loadTestEnvFile()
  }

  return {
    run: {
      tasks: {
        'i18n-generate': {
          command: 'bun tooling/i18n/generate.ts',
          cache: {
            input: [
              'src/**/i18n/*.json',
              'tooling/i18n/**',
              'project.inlang/settings.json',
              'project.inlang/paraglide.config.ts',
              'package.json',
              fromWorkspace('bun.lock')
            ],
            output: ['paraglide/**', '.paraglide/messages/**']
          }
        },
        'lint-css': {
          command: 'bun tooling/css/check.ts',
          dependsOn: [TOOLING_BUILD],
          cache: {
            env: ['NODE_ENV'],
            input: [{ auto: true }, ...CSS_CACHE_INPUTS]
          }
        },
        'dead-code-project': {
          command:
            'knip-bun --config tooling/knip.ts && knip-bun --config tooling/knip.ts --strict',
          dependsOn: [TOOLING_BUILD],
          // Os plugins do Knip leem as configurações da raiz; como no lint de
          // CSS, o rastreamento automático das leituras do Bun varia por
          // sistema operacional.
          cache: {
            env: ['NODE_ENV'],
            input: [
              { auto: true },
              'src/**',
              'paraglide/**',
              'tooling/**',
              '*.ts',
              'tsconfig*.json',
              'package.json',
              ...WORKSPACE_INPUTS
            ],
            output: []
          }
        },
        'lint-project': {
          command: 'vp lint',
          dependsOn: ['lint-css'],
          cache: { env: ['NODE_ENV'], input: PROJECT_CHECK_INPUTS }
        },
        // Num monorepo, o vp check usa o lint e o fmt da raiz; o vp fmt e o
        // vp lint leem a configuração desta pasta.
        'check-project': {
          command: 'vp fmt --check && vp lint',
          dependsOn: ['lint-css'],
          cache: { env: ['NODE_ENV'], input: PROJECT_CHECK_INPUTS }
        },
        // Os tipos da aplicação saem do vp check, com typeCheck no lint. O
        // rastreamento automático não vê as leituras do tsc nativo, então as
        // entradas ficam explícitas. De src entram só as extensões que o tsc lê;
        // CSS, imagens e fontes chegam por declarações de módulo. O bun.lock
        // representa os tipos instalados, mas guarda só o caminho dos patches,
        // então o conteúdo deles entra à parte. Com noEmit, o tsc só grava o
        // .tsbuildinfo em .tsbuild/, que é cache próprio dele, então nada precisa
        // ser restaurado.
        'typecheck-node': {
          command: 'tsc --project tsconfig.node.json',
          dependsOn: [TOOLING_BUILD],
          cache: {
            input: [
              'tsconfig.json',
              'tsconfig.node.json',
              'vite.config.ts',
              'playwright.config.ts',
              'tooling/**/*.ts',
              // O tooling importa módulos de src, e o tsconfig inclui a
              // configuração do Paraglide, que importa o settings.json.
              'src/**/*.ts',
              'src/**/*.tsx',
              'src/**/*.json',
              'project.inlang/paraglide.config.ts',
              'project.inlang/settings.json',
              'package.json',
              'patches/**',
              ...WORKSPACE_INPUTS
            ],
            output: []
          }
        },
        // Os testes criam repositórios e fixtures em diretórios temporários que
        // o cache não rastreia; cada execução precisa rodar de verdade.
        'test-tooling': {
          command: `node --test${TOOLING_TEST_CONCURRENCY} --test-timeout=60000 'tooling/__tests__/*.test.ts' 'tooling/!(release)/**/__tests__/*.test.ts'`,
          cache: false
        }
      }
    },
    // O plugin do Solid apaga o manifesto do client que ele mesmo liga, então
    // nada de .vite/ chega ao estático publicado. Só o build E2E, que não é
    // publicado, mantém o manifesto para o Hydration.preload achar o chunk da
    // rota.
    build: {
      manifest: mode === 'e2e',
      rolldownOptions: {
        output: {
          comments: false
        }
      }
    },
    // O Lightning CSS transpila nesting, light-dark() e prefixos para os
    // navegadores do Baseline padrão do Vite. O nome das classes dos CSS Modules
    // vem só do conteúdo: o [hash] padrão inclui a query, e o ?inline usado pelo
    // plugin do Solid no SSR de desenvolvimento geraria outras classes
    // (vitejs/vite#23735).
    css: {
      transformer: 'lightningcss',
      lightningcss: { cssModules: { pattern: '[content-hash]_[local]' } }
    },
    resolve: { tsconfigPaths: true },
    // Repassa ao terminal os erros e avisos do navegador durante o vp dev.
    server: { ...server, forwardConsole: true },
    preview: server,
    plugins: mode === 'test' ? [] : appPlugins(mode),
    fmt,
    lint,
    test: solidTest({ root: import.meta.dirname, plugins: componentPlugins() })
  }
})
