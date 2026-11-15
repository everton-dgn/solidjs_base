import { locales } from '#solid-runtime/i18n/locale/index.ts'
import { localizeHref } from '#solid-runtime/i18n/urls/index.ts'
import { walkStaticRoutes } from '#solid-runtime/routing/walkStaticRoutes/index.ts'
import type { StaticRoute } from '#solid-runtime/routing/walkStaticRoutes/types.ts'

// Parameterized routes stay dynamic because the build does not know their values.
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
