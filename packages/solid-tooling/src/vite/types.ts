import type { NitroConfig, NitroModuleInput, PublicAssetDir } from 'nitro/types'
import type { PluginOption, UserConfig } from 'vite-plus'

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

export type RunTask = NonNullable<
  NonNullable<UserConfig['run']>['tasks']
>[string]

export type ExtensionContext = { target: 'app' | 'test'; mode: string }

export type SolidAppExtension = {
  plugins?: PluginOption[]
  nitroModules?: NitroModuleInput[]
}

export type SolidAppOptions = {
  root: string
  middleware?: string
  serverSetup?: string
  e2e?: E2eOptions
  icons?: Record<string, string>
  securityHeaders: StaticSecurityHeaders
  publicAssets?: StaticAssetDir[]
  staticPaths?: string[]
  routeRules?: Record<string, RouteRule>
  extend?: (
    context: ExtensionContext
  ) => SolidAppExtension | Promise<SolidAppExtension>
  workspace?: WorkspaceOptions
  tasks?: Record<string, RunTask>
}
