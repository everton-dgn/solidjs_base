import path from 'node:path'

import {
  type ModuleRef,
  PageFileSystemRouter,
  type RouteManifestEntry
} from 'filesystem-routing'
import { DEFAULT_EXTENSIONS } from 'filesystem-routing/vite'
import type { KnipConfiguration } from 'knip'

import { hasMatch } from '../has-match.ts'

type AppSettings = Pick<
  KnipConfiguration,
  'ignoreBinaries' | 'ignoreDependencies' | 'ignoreIssues' | 'exclude'
>

type KnipOptions = AppSettings & {
  root: string
  configFile?: string
  entry?: string[]
}

type ConfigureKnip = () => Promise<KnipConfiguration>

type RouteDirectory = {
  directory: string
  isProduction: boolean
}

type RouteScan = RouteDirectory & { root: string }

const DEFAULT_CONFIG_FILE = 'tooling/knip.ts'
// The Solid Vite plugin loads the entry pair and the middleware by path, and
// Knip only reads solid() when vite.config.ts imports it statically
// (webpro-nl/knip#2147). Paraglide's runtime loads the URLPattern polyfill,
// and the plugin reads env.ts to build virtual:solid-env.
const CONVENTION_ENTRIES = [
  'src/entry-server.tsx',
  'src/entry-client.tsx',
  'paraglide/runtime.js',
  'src/middleware/index.ts',
  'env.ts'
]
const ROUTE_DIRECTORIES: RouteDirectory[] = [
  { directory: 'src/routes', isProduction: true },
  { directory: 'src/tests/fixtures/routes', isProduction: false },
  { directory: 'src/tests/fixtures/e2e/routes', isProduction: false }
]
const TOOLING_PROJECT = 'tooling/**/*.ts'

function isModuleRef(value: unknown): value is ModuleRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'src' in value &&
    typeof value.src === 'string'
  )
}

// Pages ($component) and HTTP handlers ($GET, $POST...) are entries: only the
// filesystem-routing manifest imports them.
function routeSources(route: RouteManifestEntry): string[] {
  return Object.entries(route).flatMap(([key, value]) =>
    key.startsWith('$') && isModuleRef(value) ? [value.src] : []
  )
}

async function discoverRouteModules({
  root,
  directory,
  isProduction
}: RouteScan): Promise<string[]> {
  const router = new PageFileSystemRouter({
    dir: path.join(root, directory),
    // The fileRoutes plugin uses the same default list.
    extensions: DEFAULT_EXTENSIONS,
    httpMethods: true
  })
  const routes = await router.getRoutes()
  const sources = new Set(routes.flatMap(route => routeSources(route)))
  return [...sources].map(
    source => path.relative(root, source) + (isProduction ? '!' : '')
  )
}

// With treatConfigHintsAsErrors, an entry or project pattern without a file
// fails the run, so the defaults only list what the application has.
async function conventionEntries(root: string): Promise<string[]> {
  const entries = await Promise.all(
    CONVENTION_ENTRIES.map(async pattern =>
      (await hasMatch({ root, pattern })) ? [`${pattern}!`] : []
    )
  )
  return entries.flat()
}

export function defineKnipConfig({
  root,
  configFile = DEFAULT_CONFIG_FILE,
  entry = [],
  ignoreBinaries,
  ignoreDependencies,
  ignoreIssues = {},
  exclude
}: KnipOptions): ConfigureKnip {
  return async function configureKnip() {
    const [conventions, routes, hasTooling] = await Promise.all([
      conventionEntries(root),
      Promise.all(
        ROUTE_DIRECTORIES.map(route => discoverRouteModules({ root, ...route }))
      ),
      hasMatch({ root, pattern: TOOLING_PROJECT })
    ])
    // Knip adds the --config file to the entries in production mode too, and
    // --strict accepts only dependencies there. Ignoring the issue in that file
    // keeps an import of this package in src/ reported.
    const configIssues = ignoreIssues[configFile] ?? []

    return {
      entry: [...new Set([...conventions, ...entry, ...routes.flat()])],
      project: [
        'src/**/*.{ts,tsx}!',
        ...(hasTooling ? [TOOLING_PROJECT] : []),
        '!src/tests/**!',
        '!src/**/__tests__/**!',
        '!src/**/*.test.{ts,tsx}!'
      ],
      // The plugin takes every file in src/routes as an entry and would hide
      // unused helpers next to the routes; the routes come from the router.
      'filesystem-routing': false,
      ...(ignoreBinaries ? { ignoreBinaries } : {}),
      ...(ignoreDependencies ? { ignoreDependencies } : {}),
      ignoreIssues: {
        ...ignoreIssues,
        [configFile]: [...new Set([...configIssues, 'unlisted' as const])]
      },
      ...(exclude ? { exclude } : {}),
      treatConfigHintsAsErrors: true
    }
  }
}
