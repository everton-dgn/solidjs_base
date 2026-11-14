import type { LocalizeRequestOptions } from '../@types/solid.d.ts'

export type Next = LocalizeRequestOptions['next']
export type Middleware = (request: Request, next: Next) => Promise<Response>

export type { StartMiddleware } from '@solidjs/vite-plugin'
