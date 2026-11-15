import { createRequestLocale } from 'virtual:solid-app/request-middleware'

import { apiRoutes } from '../apiRoutes/index.ts'
import { containFailures } from '../containFailures/index.ts'
import { restrictPageMethods } from '../restrictPageMethods/index.ts'
import type { createSecurityHeaders } from '../securityHeaders/index.ts'
import type { Middleware, StartMiddleware } from '../types.ts'

type MiddlewareOptions = {
  security: ReturnType<typeof createSecurityHeaders>
  extra?: Middleware[]
  document?: StartMiddleware
}

export function createMiddleware({
  security,
  extra = [],
  document
}: MiddlewareOptions): StartMiddleware {
  const { securityHeaders, applySecurityHeaders } = security
  const localizeRequest = createRequestLocale({ applySecurityHeaders })
  // API handlers may terminate the chain, including POST handlers on pages.
  const run = containFailures({
    chain: [...extra, securityHeaders, apiRoutes, restrictPageMethods],
    applySecurityHeaders
  })
  // Inner failures keep the request locale; the outer boundary covers locale resolution.
  const localized: Middleware = (request, next) =>
    localizeRequest({ request, next: () => run(request, next) })
  const contained = containFailures({
    chain: [localized],
    applySecurityHeaders
  })
  if (!document) {
    return (event, next) =>
      contained(event.request, request => {
        if (request) event.request = request
        return next()
      })
  }
  return (event, next) => {
    let hasEnteredLocalizedChain = false
    const adaptDocument: Middleware = async (_request, render) =>
      document(event, () => {
        hasEnteredLocalizedChain = true
        return contained(event.request, request => {
          if (request) event.request = request
          return render()
        })
      })
    return containFailures({ chain: [adaptDocument], applySecurityHeaders })(
      event.request,
      () => {
        if (hasEnteredLocalizedChain) return next()
        return localizeRequest({ request: event.request, next })
      }
    )
  }
}
