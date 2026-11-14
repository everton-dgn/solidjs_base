import { createMiddleware } from '@evertondgn/solid-runtime/middleware/create-middleware'
import { createSecurityHeaders } from '@evertondgn/solid-runtime/middleware/security-headers'
import { env } from 'virtual:solid-env/server'

export default createMiddleware({
  security: createSecurityHeaders(),
  extra: [
    async (_request, next) => {
      const response = await next()
      response.headers.set('x-scenario-env', env.SCENARIO_LABEL ?? 'missing')
      return response
    }
  ]
})
