import { pageRoutes } from 'virtual:file-routes'
import { llms } from 'virtual:solid-app/seo-llms'

import { HTTP_SERVICE_UNAVAILABLE } from '#solid-runtime/http/constants.ts'
import { baseLocale } from '#solid-runtime/i18n/locale/index.ts'
import { withLocaleContext } from '#solid-runtime/i18n/localeContext/index.ts'
import { localizeHref } from '#solid-runtime/i18n/urls/index.ts'
import { logServerFailure } from '#solid-runtime/infra/server/logServerFailure/index.ts'
import { readPublicationPhase } from '#solid-runtime/infra/server/readPublicationPhase/index.ts'

import { isMarkdownRoute, markdownPath } from '../markdownRoute/index.ts'
import { buildLlmsText } from './helpers/buildLlmsText/index.ts'
import { collectLlmsPages } from './helpers/collectLlmsPages/index.ts'
import { memoizeOnce } from './helpers/memoizeOnce/index.ts'
import type { LlmsPage, LlmsOptions } from './types.ts'

type LocalizedPage = { page: LlmsPage; hasStaticMarkdown: boolean }

const SITE_CACHE_CONTROL = import.meta.env.PROD
  ? 'public, max-age=0, s-maxage=3600, stale-if-error=86400'
  : 'no-store'
const ROUTE_PARAMETER = /[:*]/u

function missingArtifact(): Response {
  logServerFailure({
    source: 'llms',
    error: new Error('llms.txt is missing from the file layer')
  })
  return new Response(null, {
    status: HTTP_SERVICE_UNAVAILABLE,
    headers: { 'cache-control': 'no-store' }
  })
}

export function createLlms({
  site: SITE,
  router: Router,
  notes: LLMS_NOTES = [],
  pages: LLMS_USE_CASES = [],
  fullPage: LLMS_FULL_PAGE,
  cacheControl = SITE_CACHE_CONTROL
}: LlmsOptions): () => Promise<Response> {
  const resolveSiteUrl = (path: string) => new URL(path, SITE.url).href
  if (llms.hasLlmsFull && !LLMS_FULL_PAGE) {
    throw new Error('llmsFull requires an editorial fullPage')
  }
  // Only parameter-free markdown: true routes become build artifacts.
  // Dynamic opt-ins and parameters keep request-time conversion.
  function localizePage(page: LlmsPage): LocalizedPage {
    const path = localizeHref({ href: page.path, locale: baseLocale })
    const matches = Router.match(path)
    const info = matches.map(match => match.info)
    if (!llms.hasMarkdown || !isMarkdownRoute(info)) {
      return { page: { ...page, path }, hasStaticMarkdown: false }
    }
    return {
      page: { ...page, path: markdownPath(path) },
      hasStaticMarkdown:
        info.at(-1)?.markdown === true &&
        !ROUTE_PARAMETER.test(matches.at(-1)?.pattern ?? '')
    }
  }

  // The build checks that the announcement matches the documents in llms-full.txt.
  function collectPages(): LlmsPage[] {
    const localized = [
      ...LLMS_USE_CASES,
      ...collectLlmsPages({ routes: pageRoutes, site: SITE })
    ].map(page => localizePage(page))
    const pages = localized.map(({ page }) => page)
    return llms.hasLlmsFull &&
      LLMS_FULL_PAGE &&
      localized.some(({ hasStaticMarkdown }) => hasStaticMarkdown)
      ? [...pages, LLMS_FULL_PAGE]
      : pages
  }

  function renderLlmsText(): string {
    const text = buildLlmsText({
      title: SITE.title,
      description: SITE.description,
      notes: LLMS_NOTES,
      pages: collectPages(),
      siteUrl: resolveSiteUrl('/')
    })
    if (new TextEncoder().encode(text).byteLength > llms.maxBytes) {
      throw new Error('llms.txt exceeds its byte budget')
    }
    return text
  }

  const cachedText = memoizeOnce({
    isEnabled: import.meta.env.PROD,
    render: renderLlmsText
  })

  // The file layer serves this URL in production; a missing artifact must not trigger O(N) reconstruction.

  // Site descriptions and page metadata read the locale context. The index always
  // uses the base locale, including its first cached production render.
  return function GET(): Promise<Response> {
    if (readPublicationPhase() === 'artifact') {
      return Promise.resolve(missingArtifact())
    }
    const url = resolveSiteUrl(localizeHref({ href: '/', locale: baseLocale }))
    return withLocaleContext({
      url,
      run: () =>
        new Response(cachedText(), {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'cache-control': cacheControl
          }
        })
    })
  }
}
