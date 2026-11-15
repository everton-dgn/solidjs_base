import { pageRoutes } from 'virtual:file-routes'

import {
  baseLocale,
  extractLocaleFromUrl
} from '#solid-runtime/i18n/locale/index.ts'
import { readPublicationPhase } from '#solid-runtime/infra/server/readPublicationPhase/index.ts'
import { isPagePath } from '#solid-runtime/middleware/requestClassification/index.ts'
import {
  isMarkdownRoute,
  markdownPath
} from '#solid-runtime/seo/markdownRoute/index.ts'

import { MARKDOWN_PRERENDER_PATH } from '../../constants.ts'
import type { MarkdownOptions } from '../../types.ts'
import { collectStaticMarkdownPages } from '../collectStaticMarkdownPages/index.ts'
import { createUncachedResponse } from '../uncachedResponse/index.ts'

type ListingOptions = Pick<
  MarkdownOptions,
  'router' | 'siteUrl' | 'applySecurityHeaders'
>

export function createStaticMarkdownListing({
  router: Router,
  siteUrl,
  applySecurityHeaders
}: ListingOptions): () => Response {
  const resolveSiteUrl = (path: string) => new URL(path, siteUrl).href
  const uncachedResponse = createUncachedResponse(applySecurityHeaders)
  // Reject static opt-ins resolved to another route instead of silently omitting them.
  // Inherited noindex still excludes a page without an error. Effective URL locales
  // keep llms-full.txt selection independent of index formatting.
  function listStaticMarkdown(): Response {
    const buildId: unknown = import.meta.env.PUBLICATION_BUILD_ID
    const paths: string[] = []
    const baseLocalePaths: string[] = []
    const mismatches: string[] = []
    for (const page of collectStaticMarkdownPages(pageRoutes)) {
      const url = new URL(resolveSiteUrl(page))
      const info = Router.match(url.href).map(match => match.info)
      if (
        !isPagePath({ pathname: url.pathname, method: 'GET' }) ||
        info.at(-1)?.markdown !== true
      ) {
        mismatches.push(url.pathname)
        continue
      }
      if (!isMarkdownRoute(info)) continue
      const path = markdownPath(url.pathname)
      paths.push(path)
      if ((extractLocaleFromUrl(url) ?? baseLocale) === baseLocale) {
        baseLocalePaths.push(path)
      }
    }
    return uncachedResponse(
      Response.json({
        buildId: typeof buildId === 'string' ? buildId : undefined,
        siteUrl: resolveSiteUrl('/'),
        baseLocale,
        paths,
        baseLocalePaths,
        mismatches
      })
    )
  }

  return listStaticMarkdown
}

// The header identifies Nitro during the build. Production already has an artifact;
// a public header must never trigger inventory reconstruction.
export function isStaticListing(request: Request): boolean {
  return (
    readPublicationPhase() !== 'artifact' &&
    request.headers.has('x-nitro-prerender') &&
    new URL(request.url).pathname === MARKDOWN_PRERENDER_PATH
  )
}
