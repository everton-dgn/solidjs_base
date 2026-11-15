import { createRequestEvent } from '@solidjs/web'

import { createPublicationController } from '../../../infra/server/publication/index.ts'
import { createMarkdownContent } from '../index.ts'

const HTTP_UNAVAILABLE = 503
const CSP = "default-src 'none'"

function request(method: string) {
  const event = createRequestEvent(
    new Request('https://example.com/de/about.md', { method })
  )
  event.locals.ssrRenderState = { hasCompleted: true, hasErrors: false }
  return event
}

describe('replacement security responses', () => {
  it.each(['GET', 'HEAD'])(
    'preserves replacement security responses on admission refusal for %s',
    async method => {
      const publication = createPublicationController({ markdown: 1 })
      const producer = Promise.withResolvers<Response>()
      const markdownContent = createMarkdownContent({
        publication,
        router: {
          match: () => [{ pattern: '/about', info: { markdown: true } }]
        },
        siteUrl: 'https://example.com',
        applySecurityHeaders(response) {
          const headers = new Headers(response.headers)
          headers.set('content-security-policy', CSP)
          headers.set('x-content-type-options', 'nosniff')
          return new Response(response.body, {
            status: response.status,
            headers
          })
        }
      })
      const pending = markdownContent(request('GET'), () => producer.promise)
      try {
        expect(publication.getMetrics().active).toBe(1)
        const render = vi.fn<() => Promise<Response>>()
        const response = await markdownContent(request(method), render)
        expect(response.status).toBe(HTTP_UNAVAILABLE)
        expect(Object.fromEntries(response.headers)).toMatchObject({
          'retry-after': '1',
          'cache-control': 'private, no-store',
          'content-security-policy': CSP,
          'x-content-type-options': 'nosniff'
        })
        expect(render).not.toHaveBeenCalled()
        expect(response.body === null).toBe(method === 'HEAD')
      } finally {
        producer.resolve(
          new Response('<main>Complete</main>', {
            headers: { 'content-type': 'text/html' }
          })
        )
        const completed = await pending
        await completed.text()
      }
    }
  )
})
