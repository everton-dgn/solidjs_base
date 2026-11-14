import { composeMiddleware, getRequestEvent } from '@solidjs/web'

import { isControlResponse } from '../../infra/server/isControlResponse/index.ts'
import { logServerFailure } from '../../infra/server/logServerFailure/index.ts'
import {
  createPublicError,
  publicErrorMessage
} from '../../infra/server/publicErrors/index.ts'
import { isHtmlResponse } from '../helpers/isHtmlResponse/index.ts'
import { isPageRequest } from '../requestClassification/index.ts'
import { requestNonce } from '../securityHeaders/index.ts'
import type { Middleware } from '../types.ts'

const HTTP_INTERNAL_SERVER_ERROR = 500

type ContainmentOptions = {
  chain: Middleware[]
  applySecurityHeaders: (response: Response) => Response
}

type Render = (request?: Request) => Response | Promise<Response>
type ChainEntry = (request: Request, next: Render) => Promise<Response>
type ApplySecurityHeaders = ContainmentOptions['applySecurityHeaders']
type ErrorPage = { render: Render; applySecurityHeaders: ApplySecurityHeaders }
type Containment = {
  applySecurityHeaders: ApplySecurityHeaders
  error: unknown
  request: Request
  next: Render
  isRendered: boolean
}
type Failure = { error: unknown; request: Request }

// Abandoned renders reject with the signal reason itself. Other errors remain
// failures even after the signal aborts.
function isCancellation({ error, request }: Failure): boolean {
  const { signal } = request
  return signal.aborted && Object.is(error, signal.reason)
}

function publicTextFailure(
  applySecurityHeaders: ApplySecurityHeaders
): Response {
  return applySecurityHeaders(
    new Response(publicErrorMessage(), {
      status: HTTP_INTERNAL_SERVER_ERROR,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    })
  )
}

// A discarded render may already have started the response.
async function renderErrorPage({
  render,
  applySecurityHeaders
}: ErrorPage): Promise<Response> {
  const event = getRequestEvent()
  if (!event) return publicTextFailure(applySecurityHeaders)
  event.locals.serverFailure = createPublicError()
  // The error page and its CSP must use the same request nonce.
  requestNonce()
  try {
    const page = await render()
    // Forcing a locale redirect to 500 would retain Location without a body.
    if (!isHtmlResponse(page)) {
      await page.body?.cancel()
      return publicTextFailure(applySecurityHeaders)
    }
    return applySecurityHeaders(
      new Response(page.body, {
        status: HTTP_INTERNAL_SERVER_ERROR,
        headers: page.headers
      })
    )
  } catch (error) {
    // The render reads the event signal; the original failure was already logged.
    if (!isCancellation({ error, request: event.request })) {
      logServerFailure({ source: 'error-page', error })
    }
    return publicTextFailure(applySecurityHeaders)
  }
}

async function containedResponse({
  error,
  request,
  next,
  isRendered,
  applySecurityHeaders
}: Containment): Promise<Response> {
  if (isControlResponse(error)) {
    try {
      return applySecurityHeaders(error)
    } catch {
      // Controls whose headers cannot be written or copied become failures.
    }
  }
  if (isCancellation({ error, request })) {
    return publicTextFailure(applySecurityHeaders)
  }
  logServerFailure({ source: 'middleware', error })
  return isPageRequest(request) && !isRendered
    ? renderErrorPage({ render: next, applySecurityHeaders })
    : publicTextFailure(applySecurityHeaders)
}

// Contain failures before the host logs them. This does not cover later body errors.
export function containFailures({
  chain,
  applySecurityHeaders
}: ContainmentOptions): ChainEntry {
  const run = composeMiddleware(chain)
  return async (request, next) => {
    // The plugin permits only one render per request, including an error page.
    let isRendered = false
    const render: Render = override => {
      isRendered = true
      return next(override)
    }
    try {
      return await run(request, render)
    } catch (error) {
      if (import.meta.env.DEV) throw error
      return containedResponse({
        error,
        request,
        next,
        isRendered,
        applySecurityHeaders
      })
    }
  }
}
