import type { RequestEvent } from '@solidjs/web'
import { markdown } from 'virtual:solid-app/seo-markdown'

import {
  HTTP_BAD_REQUEST,
  HTTP_NOT_FOUND
} from '#solid-runtime/http/constants.ts'
import { appendVary } from '#solid-runtime/middleware/helpers/appendVary/index.ts'
import {
  acceptsMarkdown,
  negotiatePageFormat
} from '#solid-runtime/middleware/negotiatePageFormat/index.ts'
import { isPagePath } from '#solid-runtime/middleware/requestClassification/index.ts'
import type { Next } from '#solid-runtime/middleware/types.ts'

import { createBoundedRender } from './helpers/boundedRender/index.ts'
import { createMarkdownResponses } from './helpers/markdownResponses/index.ts'
import { createMarkdownRouting } from './helpers/markdownRouting/index.ts'
import {
  isStaticListing,
  createStaticMarkdownListing
} from './helpers/staticMarkdownListing/index.ts'
import type { MarkdownOptions } from './types.ts'

export function createMarkdownContent(
  options: MarkdownOptions
): (event: RequestEvent, render: Next) => Promise<Response> {
  const { publication } = options
  const responses = createMarkdownResponses({
    ...options,
    hasLlms: markdown.hasLlms
  })
  const { normalizePublication, notAcceptable, publicResponse, unpublished } =
    responses
  const routing = createMarkdownRouting(options.router)
  const { documentUrl, isEligible, isHtmlOnly, isUnpublished } = routing
  const listStaticMarkdown = createStaticMarkdownListing(options)
  const boundedRender = createBoundedRender({
    ...options,
    responses,
    routing,
    maxInputBytes: markdown.maxInputBytes,
    maxOutputBytes: markdown.maxOutputBytes
  })
  return async function markdownContent(
    event: RequestEvent,
    render: Next
  ): Promise<Response> {
    const original = event.request
    if (!['GET', 'HEAD'].includes(original.method)) return render()
    if (markdown.static && isStaticListing(original)) {
      return listStaticMarkdown()
    }
    const { pathname } = new URL(original.url)
    if (!isPagePath({ pathname, method: original.method })) return render()
    const url = documentUrl(original)
    const isDirect = pathname.endsWith('.md')
    try {
      decodeURI(url.pathname)
    } catch {
      return publicResponse({ status: HTTP_BAD_REQUEST, request: original })
    }
    if (!isPagePath({ pathname: url.pathname, method: original.method })) {
      return publicResponse({ status: HTTP_NOT_FOUND, request: original })
    }
    const format = negotiatePageFormat(original.headers.get('accept'))
    const isPublished = isEligible(url)
    if (isDirect && isUnpublished({ request: original, url, isPublished })) {
      return unpublished(original)
    }
    if (
      (isDirect && !acceptsMarkdown(original.headers.get('accept'))) ||
      (!isDirect && isPublished && !format)
    ) {
      return notAcceptable(original)
    }
    if (!isDirect && format !== 'markdown') {
      const response = await render()
      return isPublished ? appendVary({ response, field: 'Accept' }) : response
    }
    // HTML-only rendering keeps streaming without reserving publication capacity or a deadline.
    if (!isDirect && isHtmlOnly({ request: original, url, isPublished })) {
      return render()
    }
    const response = await publication.runPublication({
      kind: 'markdown',
      signal: original.signal,
      method: original.method,
      timeoutMs: markdown.timeoutMs,
      maxOutputBytes: markdown.maxOutputBytes,
      run: ({ signal }) =>
        boundedRender({
          event,
          render,
          original,
          url,
          isDirect,
          isPublished,
          signal
        })
    })
    return normalizePublication({ response, request: original })
  }
}
