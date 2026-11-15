declare module '@solidjs/router' {
  interface RouteInfo {
    markdown?: boolean | 'dynamic'
  }
}

export type MarkdownRouterMetadata = { markdown?: boolean | 'dynamic' }
