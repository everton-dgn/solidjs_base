import path from 'node:path'
import { env, loadEnvFile } from 'node:process'

import { defineConfig, loadEnv, type ViteUserConfigFnObject } from 'vite-plus'

import { fmt } from '../fmt.ts'
import { hasI18n } from '../has-i18n.ts'
import { lint } from '../lint.ts'
import { solidTest } from '../vitest/index.ts'
import { appPlugins, testPlugins } from './plugins.ts'
import { createTasks } from './tasks.ts'
import type {
  ClientAppOptions,
  ServerAppOptions,
  SolidAppOptions
} from './types.ts'

// A baseURL of "/" or with a trailing slash would turn the static rule into
// /** or //**, which catches every route of the application.
function isPathPrefix(baseURL: string | undefined): boolean {
  return (
    typeof baseURL === 'string' &&
    baseURL.startsWith('/') &&
    baseURL.length > 1 &&
    !baseURL.endsWith('/')
  )
}

const SERVER_OPTIONS = [
  'middleware',
  'serverSetup',
  'securityHeaders',
  'publicAssets',
  'staticPaths',
  'routeRules',
  'publication',
  'seo'
]

function validateServerOptions(options: ServerAppOptions): void {
  const asset = (options.publicAssets ?? []).find(
    ({ baseURL }) => !isPathPrefix(baseURL)
  )
  if (asset) {
    throw new Error(
      `defineSolidApp: the publicAssets entry for ${asset.dir} needs a baseURL such as /images, without a trailing slash.`
    )
  }
  const staticPath = (options.staticPaths ?? []).find(
    pattern => !pattern.startsWith('/')
  )
  if (staticPath !== undefined) {
    throw new Error(
      `defineSolidApp: the static path ${staticPath} must start with a slash.`
    )
  }
}

// The types already refuse these options; the check covers JavaScript configs,
// where a server option would be ignored without a word.
function validateClientOptions(options: ClientAppOptions): void {
  const serverOption = [
    ...SERVER_OPTIONS.filter(key => key in options),
    ...('middleware' in (options.e2e ?? {}) ? ['e2e.middleware'] : [])
  ].at(0)
  if (serverOption !== undefined) {
    throw new Error(
      `defineSolidApp: ${serverOption} needs SSR; remove it or remove ssr: false.`
    )
  }
}

function validateOptions(options: SolidAppOptions): void {
  if (options.ssr === false) {
    validateClientOptions(options)
    return
  }
  validateServerOptions(options)
}

function loadTestEnvFile(root: string): void {
  try {
    loadEnvFile(path.join(root, '.env.test'))
  } catch (error) {
    const isMissing =
      error instanceof Error && 'code' in error && error.code === 'ENOENT'
    if (!isMissing) throw error
  }
}

export type {
  ClientAppOptions,
  ServerAppOptions,
  SolidAppOptions
} from './types.ts'
export type { SeoOptions } from '../seo-module.ts'
export type { FontFamily, FontFile } from '../fonts/types.ts'

export function defineSolidApp(
  options: SolidAppOptions
): ViteUserConfigFnObject {
  validateOptions(options)
  const { root } = options

  return defineConfig(({ mode }) => {
    const localEnv = loadEnv(mode, root, ['HOST', 'PORT'])
    const server = {
      host: localEnv.HOST,
      port: localEnv.PORT ? Number(localEnv.PORT) : undefined
    }

    if (mode === 'test') {
      loadTestEnvFile(root)
    }

    return {
      run: {
        tasks: {
          ...createTasks({
            workspace: options.workspace,
            isCi: Boolean(env.CI),
            hasI18n: hasI18n(root)
          }),
          ...options.tasks
        }
      },
      // The Solid plugin deletes the client manifest it turns on, so nothing
      // from .vite/ reaches the published static files. Only the e2e build,
      // which is never published, keeps the manifest, so that
      // Hydration.preload finds the chunk of the route and the TEST_PREBUILT
      // guard of ./playwright can tell the two builds apart.
      build: {
        manifest: mode === 'e2e',
        rolldownOptions: {
          output: {
            comments: false
          }
        }
      },
      // Lightning CSS transpiles nesting, light-dark() and prefixes for the
      // browsers of the default Vite Baseline. The CSS Modules class names come
      // only from the content: the default [hash] includes the query, and the
      // ?inline that the Solid plugin uses in the development SSR would produce
      // other classes (vitejs/vite#23735).
      css: {
        transformer: 'lightningcss',
        lightningcss: { cssModules: { pattern: '[content-hash]_[local]' } }
      },
      resolve: { tsconfigPaths: true },
      // Forwards the browser errors and warnings to the terminal during vp dev.
      server: { ...server, forwardConsole: true },
      preview: server,
      plugins: mode === 'test' ? [] : appPlugins({ options, mode }),
      fmt,
      lint,
      test: solidTest({
        ...options.test,
        root,
        language: options.language,
        seo: options.ssr === false ? undefined : options.seo,
        plugins: () => testPlugins({ options, mode })
      })
    }
  })
}
