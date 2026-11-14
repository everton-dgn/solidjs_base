import { createSecurityHeaders } from '@evertondgn/solid-runtime/middleware/security-headers'
import type { StartMiddleware } from '@evertondgn/solid-runtime/middleware/types'

const { securityHeaders } = createSecurityHeaders()
const middleware: StartMiddleware = (event, next) =>
  securityHeaders(event.request, next)

export default middleware
