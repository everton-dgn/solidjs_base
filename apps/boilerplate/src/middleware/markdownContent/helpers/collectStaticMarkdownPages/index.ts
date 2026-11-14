import { localizeHref } from '@evertondgn/solid-runtime/i18n/urls'
import type { StaticRoute } from '@evertondgn/solid-runtime/routing/types'
import { walkStaticRoutes } from '@evertondgn/solid-runtime/routing/walk-static-routes'
import { locales } from '@paraglide/runtime.js'

// Rotas com parâmetro ficam fora: o build não conhece seus valores e elas
// continuam convertidas na requisição.
export function collectStaticMarkdownPages(
  routes: readonly StaticRoute[]
): string[] {
  const pages = new Set<string>()
  walkStaticRoutes<undefined>({
    routes,
    initialState: undefined,
    visit: ({ route, path, parentState }) => {
      if (
        route.page &&
        route.$$route?.require().route?.info?.markdown === true
      ) {
        pages.add(path)
      }
      return parentState
    }
  })
  return [...pages].flatMap(path =>
    locales.map(locale => localizeHref({ href: path, locale }))
  )
}
