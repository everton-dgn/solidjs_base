import { createRequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { apiRoutes } from '../index.ts'

vi.mock(import('virtual:file-routes'), () => ({
  default: [
    {
      path: '/api/ping',
      $GET: { require: () => ({ GET: () => new Response('pong') }) }
    }
  ]
}))

const ORIGIN = 'https://example.com'

function request(path: string): Request {
  return new Request(new URL(path, ORIGIN))
}

describe('API routes step', () => {
  // The route handler receives the request event, so the dispatch needs its
  // scope, as in the server entry.
  it('answers a request that matches an API route', async () => {
    const next = vi.fn<() => Promise<Response>>()
    const ping = request('/api/ping')

    const response = await provideRequestEvent(createRequestEvent(ping), () =>
      apiRoutes(ping, next)
    )

    await expect(response.text()).resolves.toBe('pong')
    expect(next).not.toHaveBeenCalled()
  })

  it('passes a request without an API route to the next handler', async () => {
    const original = new Response('page')
    const next = vi.fn<() => Promise<Response>>().mockResolvedValue(original)

    await expect(apiRoutes(request('/about'), next)).resolves.toBe(original)
    expect(next).toHaveBeenCalledExactlyOnceWith()
  })
})
