import type { RequestEvent } from '@solidjs/web'

import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_MULTIPLE_CHOICES,
  HTTP_NOT_FOUND,
  HTTP_OK
} from '#solid-runtime/http/constants.ts'
import { logServerFailure } from '#solid-runtime/infra/server/logServerFailure/index.ts'
import { appendVary } from '#solid-runtime/middleware/helpers/appendVary/index.ts'
import { isHtmlResponse } from '#solid-runtime/middleware/helpers/isHtmlResponse/index.ts'
import type { Next } from '#solid-runtime/middleware/types.ts'
import { markdownPath } from '#solid-runtime/seo/markdownRoute/index.ts'

import type { MarkdownOptions } from '../../types.ts'
import { convertHtml } from '../convertHtml/index.ts'
import type { createMarkdownResponses } from '../markdownResponses/index.ts'
import type { createMarkdownRouting } from '../markdownRouting/index.ts'

type RenderOptions = {
  event: RequestEvent
  render: Next
  original: Request
  url: URL
  isDirect: boolean
  isPublished: boolean
  signal: AbortSignal
}
type ConvertOptions = { response: Response; url: URL; signal: AbortSignal }
type DiscardOptions = { response: Response; signal: AbortSignal }
type Publication = { response: Response; isPublished: boolean }
type RedirectOptions = { response: Response; url: URL; request: Request }

type BoundedOptions = {
  siteUrl: MarkdownOptions['siteUrl']
  responses: ReturnType<typeof createMarkdownResponses>
  routing: ReturnType<typeof createMarkdownRouting>
  maxInputBytes: number
  maxOutputBytes: number
}
async function discardAbortedRender({
  response,
  signal
}: DiscardOptions): Promise<void> {
  if (!signal.aborted) return
  await response.body?.cancel()
  signal.throwIfAborted()
}
export function createBoundedRender({
  siteUrl,
  responses,
  routing,
  maxInputBytes,
  maxOutputBytes
}: BoundedOptions): (options: RenderOptions) => Promise<Response> {
  const { markdownHeaders, publicResponse, uncachedResponse } = responses
  const { isEligible } = routing
  const resolveSiteUrl = (path: string) => new URL(path, siteUrl).href
  // none means noindex, nofollow; max-image-preview only limits the preview.
  const NOINDEX = /(?<!max-image-preview\s*:\s*)\b(?:noindex|none)\b/iu

  function canPublish({ response, isPublished }: Publication): boolean {
    return (
      isPublished && !NOINDEX.test(response.headers.get('x-robots-tag') ?? '')
    )
  }

  function canConvert({ response, isPublished }: Publication): boolean {
    if (!isHtmlResponse(response)) return false
    if (response.status === HTTP_NOT_FOUND) return true
    return response.status === HTTP_OK && canPublish({ response, isPublished })
  }

  async function resolveRedirect({
    response,
    url,
    request
  }: RedirectOptions): Promise<Response> {
    // Nitro accepts prerender redirects, but the saved file loses its HTTP status.
    // An ordinary client sending this header only receives a public 500 instead.
    if (request.headers.has('x-nitro-prerender')) {
      await response.body?.cancel()
      return publicResponse({ status: HTTP_INTERNAL_SERVER_ERROR, request })
    }
    // The rendered response already has security headers; only cache policy remains.
    const redirect = appendVary({
      response: new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      }),
      field: 'Accept'
    })
    redirect.headers.set('cache-control', 'private, no-store')
    const location = response.headers.get('location')
    if (!location) return redirect
    const target = new URL(location, url)
    if (
      target.origin !== url.origin ||
      target.username ||
      target.password ||
      target.pathname.startsWith('//') ||
      target.pathname.endsWith('.md') ||
      !isEligible(target)
    ) {
      return redirect
    }
    target.pathname = markdownPath(target.pathname)
    redirect.headers.set(
      'location',
      `${target.pathname}${target.search}${target.hash}`
    )
    return redirect
  }

  async function convertPage({
    response,
    url,
    signal
  }: ConvertOptions): Promise<string> {
    // Resolve links against the public origin because prerender requests use a local URL.
    const markdown = await convertHtml({
      response,
      url: resolveSiteUrl(`${url.pathname}${url.search}`),
      signal,
      maxBytes: maxInputBytes
    })
    if (new TextEncoder().encode(markdown).byteLength > maxOutputBytes) {
      throw new Error('Markdown output limit exceeded')
    }
    return markdown
  }

  async function renderMarkdown({
    event,
    render,
    original,
    url,
    isDirect,
    isPublished,
    signal
  }: RenderOptions): Promise<Response> {
    const response = await render()
    await discardAbortedRender({ response, signal })
    if (
      response.status >= HTTP_MULTIPLE_CHOICES &&
      response.status < HTTP_BAD_REQUEST
    ) {
      return isDirect
        ? resolveRedirect({ response, url, request: original })
        : response
    }
    if (
      isDirect &&
      response.status === HTTP_OK &&
      !canPublish({ response, isPublished })
    ) {
      await response.body?.cancel()
      return publicResponse({ status: HTTP_NOT_FOUND, request: original })
    }
    const state = event.locals.ssrRenderState
    if (
      isHtmlResponse(response) &&
      response.status === HTTP_INTERNAL_SERVER_ERROR &&
      state?.hasErrors === true
    ) {
      await response.body?.cancel()
      return publicResponse({
        status: HTTP_INTERNAL_SERVER_ERROR,
        request: original
      })
    }
    if (!canConvert({ response, isPublished })) return response
    if (state?.hasCompleted !== true || state.hasErrors !== false) {
      await response.body?.cancel()
      return publicResponse({
        status: HTTP_INTERNAL_SERVER_ERROR,
        request: original
      })
    }
    let markdown: string
    try {
      markdown = await convertPage({ response, url, signal })
    } catch (error) {
      // Cancellation belongs to the publication controller. Limits and converter failures
      // produce a public 500 in the original request language.
      signal.throwIfAborted()
      logServerFailure({ source: 'middleware', error })
      return publicResponse({
        status: HTTP_INTERNAL_SERVER_ERROR,
        request: original
      })
    }
    const converted = new Response(markdown, {
      status: response.status,
      headers: markdownHeaders(response)
    })
    return uncachedResponse(
      appendVary({ response: converted, field: 'Accept' })
    )
  }

  function boundedRender({
    signal,
    ...options
  }: RenderOptions): Promise<Response> {
    const { event, original, url } = options
    const headers = new Headers(original.headers)
    headers.set('accept', 'text/html')
    event.renderMode = 'async'
    event.request = new Request(url, { method: 'GET', headers, signal })
    return renderMarkdown({ ...options, signal })
  }

  return boundedRender
}
