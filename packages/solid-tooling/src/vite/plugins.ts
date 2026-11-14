import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { lazyPlugins, type PluginOption } from 'vite-plus'

import { I18N_SETTINGS } from '../has-i18n.ts'
import { localeModule } from '../locale-module.ts'
import type {
  ExtensionContext,
  ServerAppOptions,
  SolidAppExtension,
  SolidAppOptions
} from './types.ts'

type PluginModules = Awaited<ReturnType<typeof loadPluginModules>>
type TargetInput = { options: SolidAppOptions; mode: string }
type ServerTargetInput = { options: ServerAppOptions; mode: string }
type ExtensionInput = TargetInput & Pick<ExtensionContext, 'target'>
type PluginSetup = {
  modules: PluginModules
  extension: SolidAppExtension
  options: SolidAppOptions
  mode: string
}
type IconsInput = { modules: PluginModules; options: SolidAppOptions }
type StaticPathsInput = { options: ServerAppOptions; locales: string[] }
type LocalePathInput = { staticPath: string; locales: string[] }

const ROUTE_TYPES = 'src/@types/routes.d.ts'
const SEO_FILE_PATHS = [
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/sitemaps/pages/**',
  '/_markdown/static.json'
]

// The plugins are imported only when Vite really runs. vp lint, fmt, check,
// staged and the editor tooling read the config without paying that cost or
// getting the Nitro start-up logs on stdout.
async function loadPluginModules() {
  const [solid, routing, icons, loaders] = await Promise.all([
    import('@solidjs/vite-plugin'),
    import('filesystem-routing/vite'),
    import('unplugin-icons/vite'),
    import('unplugin-icons/loaders')
  ])
  return {
    solid: solid.default,
    fileRoutes: routing.fileRoutes,
    Icons: icons.default,
    FileSystemIconLoader: loaders.FileSystemIconLoader
  }
}

async function readExtension({
  options,
  target,
  mode
}: ExtensionInput): Promise<SolidAppExtension> {
  return (await options.extend?.({ target, mode })) ?? {}
}

// The locales come from the same file as the Paraglide compiler, so the rules
// of the published Markdown follow a new locale without another option. An
// application without Paraglide publishes no locale folder.
async function readLocales(root: string): Promise<string[]> {
  let source: string
  try {
    source = await readFile(path.join(root, I18N_SETTINGS), 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw new Error(
      `defineSolidApp: cannot read the locales from ${I18N_SETTINGS}.`,
      { cause: error }
    )
  }
  let settings: unknown
  try {
    settings = JSON.parse(source)
  } catch (error) {
    throw new Error(
      `defineSolidApp: cannot read the locales from ${I18N_SETTINGS}.`,
      { cause: error }
    )
  }
  const locales =
    settings !== null && typeof settings === 'object' && 'locales' in settings
      ? settings.locales
      : undefined
  if (
    !Array.isArray(locales) ||
    !locales.every(locale => typeof locale === 'string')
  ) {
    throw new Error(
      `defineSolidApp: ${I18N_SETTINGS} must list its locales as strings.`
    )
  }
  return locales
}

function isUnderLocale({ staticPath, locales }: LocalePathInput): boolean {
  const [firstSegment] = staticPath.split('/').slice(1)
  return locales.includes(firstSegment ?? '')
}

// Nitro compiles the routeRules with the preMerge of h3, which refuses a partial
// overlap: a path inside a locale folder would cross its /<locale>/**.md rule,
// and the compilation would fall back to the simple mode with a warning. The
// published .md files sit under the locale prefix of the Paraglide urlPatterns.
function staticFilePaths({ options, locales }: StaticPathsInput): string[] {
  const appPaths = [
    ...(options.publicAssets ?? []).map(asset => `${asset.baseURL}/**`),
    ...(options.staticPaths ?? [])
  ]
  const collision = appPaths.find(staticPath =>
    isUnderLocale({ staticPath, locales })
  )
  if (collision) {
    throw new Error(
      `defineSolidApp: the static path ${collision} is inside a locale folder; move it out of /${collision.split('/')[1]}/.`
    )
  }
  const publishedPaths = options.publication
    ? [...locales.map(locale => `/${locale}/**.md`), ...SEO_FILE_PATHS]
    : []
  return ['/assets/**', ...appPaths, ...publishedPaths]
}

function iconsPlugin({ modules, options }: IconsInput) {
  return modules.Icons({
    compiler: 'solid',
    // oxlint-disable-next-line eslint/max-params -- unplugin-icons calls the customizer with three arguments.
    iconCustomizer(_collection, _icon, props) {
      props['aria-hidden'] = 'true'
    },
    customCollections: Object.fromEntries(
      Object.entries(options.icons ?? {}).map(([name, folder]) => [
        name,
        modules.FileSystemIconLoader(path.resolve(options.root, folder))
      ])
    )
  })
}

function staticHeaders({ securityHeaders }: ServerAppOptions) {
  return {
    'strict-transport-security': securityHeaders['strict-transport-security'],
    'x-content-type-options': securityHeaders['x-content-type-options'],
    'cross-origin-resource-policy':
      securityHeaders['cross-origin-resource-policy']
  }
}

function clientPlugins({
  modules,
  extension,
  options,
  mode
}: PluginSetup): PluginOption[] {
  const e2eRoutes = mode === 'e2e' ? options.e2e?.routes : undefined
  return [
    localeModule(options),
    ...(extension.plugins ?? []),
    iconsPlugin({ modules, options }),
    modules.solid({ ssr: false }),
    modules.fileRoutes(
      e2eRoutes
        ? { dir: e2eRoutes, httpMethods: true }
        : { types: ROUTE_TYPES, httpMethods: true }
    )
  ]
}

async function serverPlugins({
  options,
  mode
}: ServerTargetInput): Promise<PluginOption[]> {
  const [modules, { nitro }, extension, locales] = await Promise.all([
    loadPluginModules(),
    import('nitro/vite'),
    readExtension({ options, target: 'app', mode }),
    options.publication ? readLocales(options.root) : []
  ])
  const isE2e = mode === 'e2e'
  const middleware = isE2e
    ? (options.e2e?.middleware ?? options.middleware)
    : options.middleware
  const e2eRoutes = isE2e ? options.e2e?.routes : undefined
  const headers = staticHeaders(options)
  return [
    localeModule(options),
    ...(extension.plugins ?? []),
    iconsPlugin({ modules, options }),
    modules.solid({
      start: middleware ? { middleware } : {},
      ssr: true,
      serverFunctions: options.serverSetup
        ? { serverSetup: options.serverSetup }
        : true
    }),
    modules.fileRoutes(
      e2eRoutes
        ? { dir: e2eRoutes, httpMethods: true }
        : { types: ROUTE_TYPES, httpMethods: true }
    ),
    // The Vercel function runs the Node of engines.node. The SSR stays on
    // Node until Bun keeps the contracts of Response and of the failure log.
    nitro({
      serverEntry: false,
      preset: 'vercel',
      modules: extension.nitroModules ?? [],
      // Nitro already registers the assetsDir of Vite, which serves /assets/.
      publicAssets: options.publicAssets ?? [],
      // The static files leave the CDN without going through the middleware,
      // so these rules give them the headers the middleware writes on the
      // responses of the function.
      routeRules: {
        ...Object.fromEntries(
          staticFilePaths({ options, locales }).map(staticPath => [
            staticPath,
            { headers }
          ])
        ),
        ...options.routeRules
      }
    })
  ]
}

// A client-only application imports neither Nitro nor reads the locales.
export function appPlugins({
  options,
  mode
}: TargetInput): PluginOption[] | undefined {
  return lazyPlugins(async () => {
    if (options.ssr !== false) return serverPlugins({ options, mode })
    const [modules, extension] = await Promise.all([
      loadPluginModules(),
      readExtension({ options, target: 'app', mode })
    ])
    return clientPlugins({ modules, extension, options, mode })
  })
}

// WHY: called once per test project, because each project starts its own Vite
// server and a plugin instance keeps the state of the server that resolved it
// last.
export function testPlugins({
  options,
  mode
}: TargetInput): PluginOption[] | undefined {
  return lazyPlugins(async () => {
    const [modules, extension] = await Promise.all([
      loadPluginModules(),
      readExtension({ options, target: 'test', mode })
    ])
    return [
      localeModule(options),
      ...(extension.plugins ?? []),
      iconsPlugin({ modules, options }),
      modules.solid(options.ssr === false ? {} : { serverFunctions: true }),
      modules.fileRoutes({ types: ROUTE_TYPES, httpMethods: true })
    ]
  })
}
