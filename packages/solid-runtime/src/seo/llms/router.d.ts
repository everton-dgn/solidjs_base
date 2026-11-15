import type { LlmsRouteInfo } from './route-types.ts'

declare module '@solidjs/router' {
  interface RouteInfo {
    llms?: LlmsRouteInfo
  }
}

export type LlmsRouterMetadata = { llms?: LlmsRouteInfo }
