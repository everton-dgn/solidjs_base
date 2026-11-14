import type { SitemapRouteInfo } from './source-types.ts'

declare module '@solidjs/router' {
  interface RouteInfo {
    sitemap?: SitemapRouteInfo
  }
}

export type SitemapRouterMetadata = { sitemap?: SitemapRouteInfo }
