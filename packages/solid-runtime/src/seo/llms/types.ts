import type { MarkdownMatch } from '../markdown/types.ts'
import type { SeoSite } from '../types.ts'
import type { LlmsRouterMetadata } from './router.d.ts'

type LlmsMatch = MarkdownMatch & { info?: LlmsRouterMetadata }
type LlmsRouter = { match: (url: string) => readonly LlmsMatch[] }

export type LlmsSelection = {
  shouldInclude: boolean
  section: string
  isOptional: boolean
}

export type LlmsPage = {
  path: string
  title: string
  description: string
  section: string
  isOptional: boolean
}

export type LlmsOptions = {
  site: SeoSite
  router: LlmsRouter
  notes?: readonly string[]
  pages?: readonly LlmsPage[]
  fullPage?: LlmsPage
  cacheControl?: string
}
