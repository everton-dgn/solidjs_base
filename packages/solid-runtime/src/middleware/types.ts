import type { RequestEvent, ResponseStub } from '@solidjs/web'

import type { LocalizeRequestOptions } from '../@types/solid.d.ts'

// WHY: a copy of the @solidjs/vite-plugin type. Importing it would make the
// plugin, and Vite with it, a production dependency of every application.
type StartRequestEvent = RequestEvent & {
  response: ResponseStub
  nativeEvent?: unknown
}

export type Next = LocalizeRequestOptions['next']
export type Middleware = (request: Request, next: Next) => Promise<Response>
export type StartMiddleware = (
  event: StartRequestEvent,
  next: () => Promise<Response>
) => Response | Promise<Response>
