import { createMiddleware as createRuntimeMiddleware } from '@evertondgn/solid-runtime/middleware/create-middleware'
import type {
  Middleware,
  StartMiddleware
} from '@evertondgn/solid-runtime/middleware/types'

import { markdownContent } from './markdownContent/index.ts'
import {
  securityHeaders,
  applySecurityHeaders
} from './securityHeaders/index.ts'

export function createMiddleware(extra: Middleware[] = []): StartMiddleware {
  return createRuntimeMiddleware({
    security: { securityHeaders, applySecurityHeaders },
    extra,
    document: markdownContent
  })
}

export default createMiddleware()
