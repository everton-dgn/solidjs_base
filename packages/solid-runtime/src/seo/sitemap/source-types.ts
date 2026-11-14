import type { SitemapRouterMetadata } from './router.d.ts'

type SitemapPartitionListOptions = {
  limit: number
  signal: AbortSignal
}

type SitemapPartitionReadOptions = {
  id: string
  limit: number
  signal: AbortSignal
}

// A site-absolute path and optional trustworthy W3C Datetime lastmod.
// Invalid dates are omitted during normalization.
export type SitemapEntry = {
  path: string
  lastmod?: string
}

// A parameterized route source in route.info.sitemap. Route metadata reaches
// the client bundle, so database and SDK access must cross a server function.
// Sources run sequentially on sitemap requests, never at build time. Forward
// the signal to the backend and return a Promise covering all initiated work;
// publication admission is held until the producer settles. Data caching is
// owned by the application source.
export type SitemapRouteInfo = (
  signal: AbortSignal
) => readonly SitemapEntry[] | Promise<readonly SitemapEntry[]>

export type SitemapPartitionSource = {
  id: string
  routePath: string
  // Queries must honor limit: validation after materialization cannot
  // protect the backend from an unbounded query.
  listPartitions: (
    options: SitemapPartitionListOptions
  ) => Promise<readonly string[]>
  readPartition: (
    options: SitemapPartitionReadOptions
  ) => Promise<readonly SitemapEntry[]>
}

export type SitemapMetadata = SitemapRouterMetadata
