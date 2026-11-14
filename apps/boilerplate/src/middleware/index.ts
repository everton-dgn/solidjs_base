import { apiRoutes } from '@evertondgn/solid-runtime/middleware/api-routes'
import { createLocalizeRequest } from '@evertondgn/solid-runtime/middleware/localize-request'
import { restrictPageMethods } from '@evertondgn/solid-runtime/middleware/restrict-page-methods'
import type { Middleware } from '@evertondgn/solid-runtime/middleware/types'
import type { StartMiddleware } from '@solidjs/vite-plugin'

import { containFailures } from './containFailures/index.ts'
import { markdownContent } from './markdownContent/index.ts'
import {
  securityHeaders,
  applySecurityHeaders
} from './securityHeaders/index.ts'

// API recebe o nonce e os cabeçalhos antes da negociação das páginas. A
// restrição de métodos vem depois da API, que pode tratar POST numa página.
const localizeRequest = createLocalizeRequest({ applySecurityHeaders })

const requestMiddleware: Middleware[] = [
  securityHeaders,
  apiRoutes,
  restrictPageMethods
]

export function createMiddleware(extra: Middleware[] = []): StartMiddleware {
  const run = containFailures([...extra, ...requestMiddleware])
  // A contenção da aplicação roda dentro do contexto de idioma, inclusive
  // ao renderizar o fallback. A externa contém falhas da própria resolução.
  const localized: Middleware = (request, next) =>
    localizeRequest({ request, next: () => run(request, next) })
  const contained = containFailures([localized])
  // A cadeia do projeto recebe Request; o plugin recebe o evento.
  return (event, next) => {
    let hasEnteredLocalizedChain = false
    const markdown: Middleware = (_request, render) =>
      markdownContent(event, () => {
        hasEnteredLocalizedChain = true
        return contained(event.request, request => {
          if (request) event.request = request
          return render()
        })
      })
    return containFailures([markdown])(event.request, () => {
      if (hasEnteredLocalizedChain) return next()
      return localizeRequest({ request: event.request, next })
    })
  }
}

export default createMiddleware()
