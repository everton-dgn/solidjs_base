import { LLMS_DESCRIBEDBY_LINK } from '#solid-runtime/infra/server/publication/protocol.js'

import {
  markdownContent,
  event,
  html,
  mockPublishedRoute,
  resetPublicationController,
  cancelOpenResponses
} from './fixtures.ts'

const HTTP_OK = 200
const HTTP_REDIRECT = 307
const HTTP_NOT_FOUND = 404
const HTTP_NOT_ACCEPTABLE = 406
const HTTP_SERVER_ERROR = 500

describe('HTTP Link discovery', () => {
  beforeEach(() => {
    resetPublicationController()
    mockPublishedRoute()
  })
  afterEach(cancelOpenResponses)

  it('appends the llms.txt describedby link to converted Markdown', async () => {
    for (const path of ['/de/about.md', '/de/about']) {
      const response = await markdownContent(event({ path }), () => html())
      expect(response.status).toBe(HTTP_OK)
      expect(response.headers.get('link')).toBe(LLMS_DESCRIBEDBY_LINK)
      expect(response.headers.get('vary')).toBe('Cookie, Accept')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
  })

  it('composes the describedby link after a Link from the render', async () => {
    const preload = '</assets/app.css>; rel=preload; as=style'
    const response = await markdownContent(event(), () =>
      Promise.resolve(
        new Response('<main><h1>Title</h1></main>', {
          headers: { 'content-type': 'text/html', link: preload }
        })
      )
    )
    expect(response.headers.get('link')).toBe(
      `${preload}, ${LLMS_DESCRIBEDBY_LINK}`
    )
  })

  it('sends the same status and headers on HEAD and GET', async () => {
    const get = await markdownContent(event({ path: '/de/about.md' }), () =>
      html()
    )
    const head = await markdownContent(
      event({ method: 'HEAD', path: '/de/about.md' }),
      () => html()
    )
    expect(head.status).toBe(get.status)
    expect(Object.fromEntries(head.headers)).toStrictEqual(
      Object.fromEntries(get.headers)
    )
    expect(head.headers.get('link')).toBe(LLMS_DESCRIBEDBY_LINK)
    await expect(head.text()).resolves.toBe('')
  })

  it('does not announce the index on Markdown errors, refusals or redirects', async () => {
    const responses = [
      await markdownContent(event(), () =>
        html('<main><h1>Not found</h1></main>', HTTP_NOT_FOUND)
      ),
      await markdownContent(event({ accept: 'application/json' }), () =>
        html()
      ),
      await markdownContent(event({ path: '/de/about.md' }), () =>
        Promise.resolve(
          new Response(null, {
            status: HTTP_REDIRECT,
            headers: { location: '/de/contact' }
          })
        )
      ),
      await markdownContent(event({ path: '/de/about.md' }), () =>
        Promise.resolve(
          new Response('<main>Private</main>', {
            headers: {
              'content-type': 'text/html',
              'x-robots-tag': 'noindex'
            }
          })
        )
      )
    ]
    const incomplete = event()
    incomplete.locals.ssrRenderState = {
      hasErrors: false,
      hasCompleted: false
    }
    responses.push(await markdownContent(incomplete, () => html()))
    expect(responses.map(response => response.status)).toStrictEqual([
      HTTP_NOT_FOUND,
      HTTP_NOT_ACCEPTABLE,
      HTTP_REDIRECT,
      HTTP_NOT_FOUND,
      HTTP_SERVER_ERROR
    ])
    for (const response of responses) {
      expect(response.headers.has('link')).toBe(false)
    }
  })
})
