import { getRequestEvent } from '@solidjs/web'
import {
  shouldRedirect,
  paraglideMiddleware
} from 'virtual:solid-app/locale-request'

import type { LocalizeRequestOptions } from '../../@types/solid.d.ts'
import {
  isPagePath,
  isServerFunctionPath
} from '../requestClassification/index.ts'
import { persistLocale } from './persistLocale/index.ts'

const HTTP_TEMPORARY_REDIRECT = 307

type LocaleRequest = { request: Request; pageBase?: string }

function serverFunctionLocale(request: Request): LocaleRequest {
  let url = new URL(request.url)
  let pageBase: string | undefined
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const source = new URL(referer)
      if (
        source.origin === url.origin &&
        !source.username &&
        !source.password
      ) {
        url = source
        if (isPagePath({ pathname: source.pathname, method: 'GET' })) {
          pageBase = source.href
        }
      }
    } catch {
      // Invalid referers fall back to cookie and language negotiation.
    }
  }
  const headers = new Headers(request.headers)
  headers.delete('sec-fetch-dest')
  return { request: new Request(url, { headers }), pageBase }
}

type CreateLocalizeRequestOptions = {
  applySecurityHeaders: (response: Response) => Response
}

export function createLocalizeRequest({
  applySecurityHeaders
}: CreateLocalizeRequestOptions) {
  return async function localizeRequest({
    request,
    next: proceed
  }: LocalizeRequestOptions): Promise<Response> {
    const { pathname } = new URL(request.url)
    const isServerFunction = isServerFunctionPath(pathname)
    const isPage =
      (request.method === 'GET' || request.method === 'HEAD') &&
      isPagePath({ pathname, method: request.method })
    const event = getRequestEvent()
    if (event) event.locals.localizedPageBase = undefined
    if (!isServerFunction && !isPage) return proceed()
    const localized = isServerFunction
      ? serverFunctionLocale(request)
      : { request, pageBase: request.url }
    if (event) event.locals.localizedPageBase = localized.pageBase
    const localeRequest = localized.request
    const decision = isServerFunction
      ? undefined
      : await shouldRedirect({ request: localeRequest })
    if (decision?.shouldRedirect && decision.redirectUrl) {
      return persistLocale({
        request,
        locale: decision.locale,
        response: applySecurityHeaders(
          new Response(null, {
            status: HTTP_TEMPORARY_REDIRECT,
            headers: {
              location: decision.redirectUrl.href,
              'cache-control': 'private, no-store',
              vary: 'Cookie, Accept-Language'
            }
          })
        )
      })
    }
    return paraglideMiddleware(localeRequest, async ({ locale }) => {
      const response = await proceed()
      response.headers.set('content-language', locale)
      return isServerFunction
        ? response
        : persistLocale({ request, response, locale })
    })
  }
}
