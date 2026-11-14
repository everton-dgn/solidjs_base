import { createSecurityHeaders } from '@evertondgn/solid-runtime/middleware/security-headers'
import type { StartMiddleware } from '@evertondgn/solid-runtime/middleware/types'
import { env } from 'virtual:solid-env/server'

const { securityHeaders } = createSecurityHeaders()
const middleware: StartMiddleware = async (event, next) => {
  const response = await securityHeaders(event.request, next)
  response.headers.set('x-scenario-env', env.SCENARIO_LABEL ?? 'missing')
  return response
}

export default middleware
