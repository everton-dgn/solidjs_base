import { delocalizePathname } from '@evertondgn/solid-runtime/i18n/urls'
import type { RouteInfo } from '@solidjs/router'

export function hasMarkdownOptIn(
  info: readonly (RouteInfo | undefined)[]
): boolean {
  const markdown = info.at(-1)?.markdown
  return markdown === true || markdown === 'dynamic'
}

export function isMarkdownRoute(
  info: readonly (RouteInfo | undefined)[]
): boolean {
  let isNoindex = false
  for (const route of info) isNoindex = route?.seo?.noindex ?? isNoindex
  return hasMarkdownOptIn(info) && !isNoindex
}

export function markdownPath(pathname: string): string {
  const path = pathname.replace(/\/$/u, '')
  const isIndex =
    !delocalizePathname(pathname).replace(/\/$/u, '') || path.endsWith('/index')
  return `${path}${isIndex ? '/index' : ''}.md`
}
