import { shouldRedirect } from '@paraglide/runtime.js'
import { createRequestEvent } from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'
import { endpoint } from 'virtual:solid-server-function-handler'

import { createSecurityHeaders } from '../../securityHeaders/index.ts'
import { createLocalizeRequest } from '../index.ts'

const localizeRequest = createLocalizeRequest(createSecurityHeaders())

const ORIGIN = 'https://example.com'

vi.mock(import('@paraglide/runtime.js'), { spy: true })

function run(request: Request): Promise<Response> {
  return provideRequestEvent(createRequestEvent(request), () =>
    localizeRequest({
      request,
      next: () => Promise.resolve(new Response(null))
    })
  )
}

// Paraglide also calls shouldRedirect, with effectiveRequestUrl. The step
// calls it with only the request.
const OWN_DECISION = { request: expect.any(Request) as unknown }
const MIDDLEWARE_DECISION = {
  request: expect.any(Request) as unknown,
  effectiveRequestUrl: expect.any(URL) as unknown
}

describe('locale redirect decision', () => {
  it('does not calculate a redirect for server functions', async () => {
    await run(
      new Request(`${ORIGIN}${endpoint}/save`, {
        method: 'POST',
        headers: { referer: `${ORIGIN}/fr/docs` }
      })
    )

    // The spy also observes the calls made inside Paraglide.
    expect(shouldRedirect).toHaveBeenCalledWith(MIDDLEWARE_DECISION)
    expect(shouldRedirect).not.toHaveBeenCalledWith(OWN_DECISION)
  })

  it('calculates a redirect for pages', async () => {
    await run(new Request(`${ORIGIN}/fr/docs`))

    expect(shouldRedirect).toHaveBeenCalledWith(OWN_DECISION)
  })
})
