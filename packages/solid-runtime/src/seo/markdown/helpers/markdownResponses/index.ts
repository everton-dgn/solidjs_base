import { createRequestLocale } from 'virtual:solid-app/request-middleware'

import {
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_ACCEPTABLE,
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE
} from '#solid-runtime/http/constants.ts'
import { requestLocale } from '#solid-runtime/i18n/localeContext/index.ts'
import { LLMS_DESCRIBEDBY_LINK } from '#solid-runtime/infra/server/publication/protocol.js'
import { publicErrorMessage } from '#solid-runtime/infra/server/publicErrors/index.ts'

import type { MarkdownOptions } from '../../types.ts'
import { createUncachedResponse } from '../uncachedResponse/index.ts'

type NormalizeOptions = { response: Response; request: Request }
type TextOptions = {
  status: number
  body: string | null
  headers: Record<string, string>
}
type PublicOptions = { status: number; request: Request }

type ResponseOptions = Pick<
  MarkdownOptions,
  'applySecurityHeaders' | 'notFoundMessage'
> & { hasLlms: boolean }

type MarkdownResponses = {
  publicResponse: (options: PublicOptions) => Response
  unpublished: (request: Request) => Promise<Response>
  notAcceptable: (request: Request) => Promise<Response>
  markdownHeaders: (response: Response) => Headers
  normalizePublication: (options: NormalizeOptions) => Promise<Response>
  uncachedResponse: (response: Response) => Response
}
export function createMarkdownResponses({
  applySecurityHeaders,
  notFoundMessage = () => 'Page not found',
  hasLlms
}: ResponseOptions): MarkdownResponses {
  const uncachedResponse = createUncachedResponse(applySecurityHeaders)
  const localizeRequest = createRequestLocale({ applySecurityHeaders })

  const VARY_HEADERS = 'Accept, Cookie, Accept-Language'

  function textResponse({ status, body, headers }: TextOptions): Response {
    return uncachedResponse(
      new Response(body, {
        status,
        headers: { 'content-type': 'text/plain; charset=utf-8', ...headers }
      })
    )
  }

  // This adapter runs outside the locale context. Select the message language
  // from the original request using the same order as request localization.
  function publicResponse({ status, request }: PublicOptions): Response {
    return textResponse({
      status,
      body:
        status === HTTP_INTERNAL_SERVER_ERROR
          ? publicErrorMessage(requestLocale(request))
          : null,
      headers: { vary: VARY_HEADERS }
    })
  }

  function unpublished(request: Request): Promise<Response> {
    return localizeRequest({
      request,
      next: () =>
        Promise.resolve(
          textResponse({
            status: HTTP_NOT_FOUND,
            body: request.method === 'HEAD' ? null : notFoundMessage(),
            headers: { 'x-robots-tag': 'noindex' }
          })
        )
    })
  }

  function notAcceptable(request: Request): Promise<Response> {
    return localizeRequest({
      request,
      next: () =>
        Promise.resolve(
          textResponse({
            status: HTTP_NOT_ACCEPTABLE,
            body:
              request.method === 'HEAD' ? null : 'text/html\ntext/markdown\n',
            headers: { vary: VARY_HEADERS }
          })
        )
    })
  }

  // Only successful Markdown advertises the index; append preserves inherited Link values.
  function markdownHeaders(response: Response): Headers {
    const headers = new Headers(response.headers)
    for (const name of ['content-length', 'content-encoding', 'etag']) {
      headers.delete(name)
    }
    headers.set('content-type', 'text/markdown; charset=utf-8')
    if (hasLlms && response.status === HTTP_OK) {
      headers.append('link', LLMS_DESCRIBEDBY_LINK)
    }
    if (response.status === HTTP_NOT_FOUND) {
      headers.set('x-robots-tag', 'noindex')
    }
    return headers
  }

  async function normalizePublication({
    response,
    request
  }: NormalizeOptions): Promise<Response> {
    let result = response
    if (
      response.status === HTTP_INTERNAL_SERVER_ERROR &&
      !response.headers.has('content-type')
    ) {
      result = publicResponse({ status: HTTP_INTERNAL_SERVER_ERROR, request })
    }
    if (
      response.status === HTTP_SERVICE_UNAVAILABLE &&
      response.headers.has('retry-after')
    ) {
      result = uncachedResponse(response)
    }
    if (request.method !== 'HEAD') return result
    await result.body?.cancel()
    return new Response(null, {
      status: result.status,
      headers: result.headers
    })
  }

  return {
    publicResponse,
    unpublished,
    notAcceptable,
    markdownHeaders,
    normalizePublication,
    uncachedResponse
  }
}
