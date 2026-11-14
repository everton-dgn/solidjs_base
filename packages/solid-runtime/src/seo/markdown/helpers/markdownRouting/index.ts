import { isPagePath } from '#solid-runtime/middleware/requestClassification/index.ts'
import {
  isMarkdownRoute,
  markdownPath
} from '#solid-runtime/seo/markdownRoute/index.ts'

import type { MarkdownRouter } from '../../types.ts'

type RouteRequest = { request: Request; url: URL; isPublished: boolean }

type MarkdownRouting = {
  documentUrl: (request: Request) => URL
  isEligible: (url: URL) => boolean
  isHtmlOnly: (route: RouteRequest) => boolean
  isUnpublished: (route: RouteRequest) => boolean
}
function documentUrl(request: Request): URL {
  const url = new URL(request.url)
  if (!url.pathname.endsWith('.md')) return url
  const page = url.pathname.slice(0, -'.md'.length)
  url.pathname = page.endsWith('/index')
    ? page.slice(0, -'/index'.length) || '/'
    : page
  return url
}

export function createMarkdownRouting(Router: MarkdownRouter): MarkdownRouting {
  // Without opt-in, only a catch-all 404 can become Markdown.
  function isCatchAllRoute(url: URL): boolean {
    return Router.match(url.href).at(-1)?.pattern.includes('*') === true
  }

  function isEligible(url: URL): boolean {
    return (
      isPagePath({ pathname: url.pathname, method: 'GET' }) &&
      isMarkdownRoute(Router.match(url.href).map(match => match.info))
    )
  }

  // Authenticated requests and pages without opt-in only have HTML, except a catch-all 404.
  function isHtmlOnly({ request, url, isPublished }: RouteRequest): boolean {
    return (
      request.headers.has('authorization') ||
      (!isPublished && !isCatchAllRoute(url))
    )
  }

  // Only canonical paths publish: /fr.md and /fr/about/.md would duplicate static pages.
  function isUnpublished(route: RouteRequest): boolean {
    return (
      markdownPath(route.url.pathname) !==
        new URL(route.request.url).pathname || isHtmlOnly(route)
    )
  }

  return { documentUrl, isEligible, isHtmlOnly, isUnpublished }
}
