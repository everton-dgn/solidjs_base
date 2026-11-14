import { pageRoutes } from 'virtual:file-routes'

import { readPublicationPhase } from '#solid-runtime/infra/server/readPublicationPhase/index.ts'

import type { SitemapContext, SitemapRouteContext } from '../../types.ts'
import { collectSitemapEntries } from '../collectSitemapEntries/index.ts'
import { createSitemapArtifacts } from '../createSitemapArtifacts/index.ts'
import { matchSitemapRoute } from '../matchSitemapRoute/index.ts'

export function createSitemapContext(
  usesArtifacts: boolean
): () => SitemapContext {
  let cached: SitemapContext | undefined
  return () => {
    if (import.meta.env.PROD && cached) return cached
    let routes: SitemapRouteContext | undefined
    const readRoutes = (): SitemapRouteContext => {
      routes ??= {
        manifest: collectSitemapEntries(pageRoutes),
        matchRoute: matchSitemapRoute(pageRoutes)
      }
      return routes
    }
    const context =
      usesArtifacts && readPublicationPhase() === 'artifact'
        ? { artifacts: createSitemapArtifacts(), readRoutes }
        : readRoutes()
    if (import.meta.env.PROD) cached = context
    return context
  }
}
