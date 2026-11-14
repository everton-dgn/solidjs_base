import { resolveRouteSeo } from '@evertondgn/solid-runtime/seo/resolve-route-seo'
import type { SeoMetadata } from '@evertondgn/solid-runtime/seo/types'

import { SITE } from '@/constants/site/index.ts'
import { walkStaticRoutes } from '@/helpers/walkStaticRoutes/index.ts'
import type { StaticRoute } from '@/helpers/walkStaticRoutes/types.ts'

import type { LlmsPage, LlmsSelection } from '../../types.ts'
import { resolveRouteLlms } from '../resolveRouteLlms/index.ts'

type RouteState = {
  seo: SeoMetadata
  llms: LlmsSelection
}

type StaticPage = RouteState & { path: string }

// O índice filho pode compartilhar a URL do layout; seus metadados prevalecem.
export function collectLlmsPages(routes: readonly StaticRoute[]): LlmsPage[] {
  const pages = new Map<string, StaticPage>()
  walkStaticRoutes<RouteState>({
    routes,
    initialState: {
      seo: resolveRouteSeo({ metadata: [], site: SITE }),
      llms: resolveRouteLlms({})
    },
    visit: ({ route, path, parentState }) => {
      const info = route.$$route?.require().route?.info
      const state = {
        seo: resolveRouteSeo({
          metadata: [parentState.seo, info?.seo],
          site: SITE
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
