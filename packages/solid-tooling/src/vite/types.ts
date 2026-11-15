import type { NitroConfig, NitroModuleInput, PublicAssetDir } from 'nitro/types'
import type { PluginOption, UserConfig } from 'vite-plus'

import type { FontFamily } from '../fonts/types.ts'
import type { SeoOptions } from '../seo-module.ts'
import type { SolidTestSettings } from '../vitest/types.ts'

type StaticSecurityHeaders = Record<
  | 'strict-transport-security'
  | 'x-content-type-options'
  | 'cross-origin-resource-policy',
  string
>

type E2eOptions = { middleware?: string; routes?: string }

type WorkspaceOptions = { dependsOn: string[]; inputs: string[] }

type StaticAssetDir = PublicAssetDir & { baseURL: string }

type RouteRule = NonNullable<NitroConfig['routeRules']>[string]

type SharedOptions = {
  fonts?: readonly FontFamily[]
  i18nPlugin?: false
  language?: string
  root: string
  icons?: Record<string, string>
  extend?: (
    context: ExtensionContext
  ) => SolidAppExtension | Promise<SolidAppExtension>
  workspace?: WorkspaceOptions
  tasks?: Record<string, RunTask>
  test?: SolidTestSettings
}

export type RunTask = NonNullable<
  NonNullable<UserConfig['run']>['tasks']
>[string]

export type ExtensionContext = { target: 'app' | 'test'; mode: string }

export type SolidAppExtension = {
  plugins?: PluginOption[]
  nitroModules?: NitroModuleInput[]
}

export type ServerAppOptions = SharedOptions & {
  ssr?: true
  middleware?: string
  serverSetup?: string
  e2e?: E2eOptions
  securityHeaders: StaticSecurityHeaders
  publicAssets?: StaticAssetDir[]
  staticPaths?: string[]
  routeRules?: Record<string, RouteRule>
  seo?: SeoOptions | false
}

export type ClientAppOptions = SharedOptions & {
  ssr: false
  e2e?: Pick<E2eOptions, 'routes'>
}

export type SolidAppOptions = ServerAppOptions | ClientAppOptions
