import { createLocalizeRequest } from '@evertondgn/solid-runtime/middleware/localize-request'
import { createSecurityHeaders } from '@evertondgn/solid-runtime/middleware/security-headers'
import type { StartMiddleware } from '@evertondgn/solid-runtime/middleware/types'

const { securityHeaders, applySecurityHeaders } = createSecurityHeaders()
const localizeRequest = createLocalizeRequest({ applySecurityHeaders })
const middleware: StartMiddleware = (event, next) =>
  localizeRequest({
    request: event.request,
    next: () => securityHeaders(event.request, next)
  })

export default middleware
