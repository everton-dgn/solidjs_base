import type {
  PublicationContext,
  PublicationController
} from '#solid-runtime/infra/server/publication/types.ts'

import type {
  SitemapEntry,
  SitemapPartitionSource
} from '../../source-types.ts'
import type { SitemapContext, SitemapRouteContext } from '../../types.ts'

type PageSummary = { partCount: number; isFileRoot: boolean }

export type SitemapSettings = {
  publication: Pick<PublicationController, 'runPublication'>
  timeoutMs?: number
  cacheControl?: string
  sources: readonly SitemapPartitionSource[]
  siteUrl: string
  signal: AbortSignal
  byteBudget?: number
  method?: string
}

export type ServiceOptions = SitemapSettings & SitemapContext

export type PartOptions = ServiceOptions & {
  kind: 'pages' | 'source' | 'array'
  part: string
  source?: string
}

export type InventoryOptions = Omit<SitemapSettings, 'signal' | 'method'> &
  SitemapContext

export type PagePartsOptions = {
  entries: readonly SitemapEntry[]
  siteUrl: string
  byteBudget: number
}

// Boundary between direct generation and the production manifest. Load exact
// identities through readIdentities only when an array source needs them.
export type PageCatalog = {
  readSummary: () => Promise<PageSummary>
  readHasArraySources: () => Promise<boolean>
  readPart: (index: number) => Promise<readonly SitemapEntry[] | undefined>
  readSinglePart: () => Promise<readonly SitemapEntry[]>
  readIdentities: () => Promise<ReadonlySet<string>>
  readRoutes: () => SitemapRouteContext
}

export type ReadOptions = {
  options: ServiceOptions
  catalog: PageCatalog
  byteBudget: number
  context: PublicationContext
}
