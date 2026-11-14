import type { SeoRouteInfo } from '../seo/types.ts'

declare module '@solidjs/router' {
  interface RouteInfo {
    seo?: SeoRouteInfo
  }
}

export type SeoRouterMetadata = { seo?: SeoRouteInfo }
