import { walkStaticRoutes } from '#solid-runtime/routing/walkStaticRoutes/index.ts'
import type { StaticRoute } from '#solid-runtime/routing/walkStaticRoutes/types.ts'
import { resolveRouteSeo } from '#solid-runtime/seo/resolveRouteSeo/index.ts'
import type { SeoMetadata, SeoSite } from '#solid-runtime/seo/types.ts'

import type { LlmsPage, LlmsSelection } from '../../types.ts'
import { resolveRouteLlms } from '../resolveRouteLlms/index.ts'

type RouteState = {
  seo: SeoMetadata
  llms: LlmsSelection
}

type StaticPage = RouteState & { path: string }

type CollectionOptions = { routes: readonly StaticRoute[]; site: SeoSite }

// An index child may share its layout URL; the child metadata takes precedence.
export function collectLlmsPages({
  routes,
  site
}: CollectionOptions): LlmsPage[] {
  const pages = new Map<string, StaticPage>()
  walkStaticRoutes<RouteState>({
    routes,
    initialState: {
      seo: resolveRouteSeo({ metadata: [], site }),
      llms: resolveRouteLlms({})
    },
    visit: ({ route, path, parentState }) => {
      const info = route.$$route?.require().route?.info
      const state = {
        seo: resolveRouteSeo({
          metadata: [parentState.seo, info?.seo],
          site
        }),
        llms: resolveRouteLlms({ parent: parentState.llms, info: info?.llms })
      }
      if (route.page) pages.set(path, { path, ...state })
      return state
    }
  })
  return [...pages.values()]
    .filter(({ seo, llms }) => llms.shouldInclude && !seo.noindex)
    .map(({ path, seo, llms }) => ({
      path,
      title: seo.title,
      description: seo.description,
      section: llms.section,
      isOptional: llms.isOptional
    }))
}
