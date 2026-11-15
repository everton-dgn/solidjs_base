import type { RouteInfo } from '@solidjs/router'

import type { PublicationController } from '#solid-runtime/infra/server/publication/types.ts'

import type { MarkdownRouterMetadata } from './router.d.ts'

export type MarkdownMatch = {
  info?: RouteInfo & MarkdownRouterMetadata
  pattern: string
}
export type MarkdownRouter = {
  match: (url: string) => readonly MarkdownMatch[]
}
export type MarkdownOptions = {
  publication: PublicationController
  router: MarkdownRouter
  siteUrl: string
  applySecurityHeaders: (response: Response) => Response
  notFoundMessage?: () => string
}
