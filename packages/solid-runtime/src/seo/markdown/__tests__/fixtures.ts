import { getLocale } from '@paraglide/runtime.js'
import { createRequestEvent, type RequestEvent } from '@solidjs/web'
import { Router } from '@testing/markdown/router.ts'
import { SITE } from '@testing/seo/site.ts'

import { createPublicationController } from '../../../infra/server/publication/index.ts'
import { createSecurityHeaders } from '../../../middleware/securityHeaders/index.ts'
import { createMarkdownContent } from '../index.ts'

type Options = {
  path?: string
  accept?: string
  method?: string
  signal?: AbortSignal
}
const HTTP_OK = 200
let publicationController: ReturnType<typeof createPublicationController>
let service: ReturnType<typeof createMarkdownContent>
let openResponses: Response[]

export async function markdownContent(
  request: RequestEvent,
  render: Parameters<typeof service>[1]
): Promise<Response> {
  const response = await service(request, render)
  openResponses.push(response)
  return response
}

export function event({
  path = '/de/about',
  accept = 'text/markdown',
  method = 'GET',
  signal
}: Options = {}): RequestEvent {
  const request = createRequestEvent(
    new Request(`https://example.com${path}`, {
      method,
      headers: { accept },
      signal
    })
  )
  request.locals.ssrRenderState = { hasErrors: false, hasCompleted: true }
  return request
}

export function html(
  body = '<main><h1>Title</h1><p>Public content</p></main>',
  status = HTTP_OK
): Promise<Response> {
  return Promise.resolve(
    new Response(body, {
      status,
      headers: { 'content-type': 'text/html', vary: 'Cookie' }
    })
  )
}

export function mockPublishedRoute(): void {
  vi.stubEnv('DEV', false)
  vi.spyOn(Router, 'match').mockReturnValue([
    {
      path: '/about',
      pattern: '/about',
      match: '/about',
      params: {},
      info: { markdown: true }
    }
  ])
}

export function resetPublicationController(): void {
  vi.stubEnv('PUBLICATION_BUILD_ID', 'markdown-tests')
  publicationController = createPublicationController()
  service = createMarkdownContent({
    publication: publicationController,
    router: Router,
    siteUrl: SITE.url,
    applySecurityHeaders: createSecurityHeaders().applySecurityHeaders,
    notFoundMessage: () => `Missing page in ${getLocale()}.`
  })
  openResponses = []
}

export async function cancelOpenResponses(): Promise<void> {
  for (const response of openResponses) {
    try {
      await response.body?.cancel()
    } catch {
      /* Already consumed. */
    }
  }
}

export function getPublicationMetrics(): ReturnType<
  typeof publicationController.getMetrics
> {
  return publicationController.getMetrics()
}
