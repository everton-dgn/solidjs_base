import { apiRouteMethods, isPagePath } from '../requestClassification/index.ts'
import type { Next } from '../types.ts'

const HTTP_METHOD_NOT_ALLOWED = 405
const PAGE_METHODS = ['GET', 'HEAD']

function methodNotAllowed(allowed: string[]): Promise<Response> {
  return Promise.resolve(
    new Response(null, {
      status: HTTP_METHOD_NOT_ALLOWED,
      headers: { allow: allowed.join(', ') }
    })
  )
}

// After the API routes, only the render gets the request. In a build, the
// plugin handler renders the page for any method, outside the locale context
// and with status 200, even on an API path with no handler for the method;
// router forms post to the server functions endpoint, never to the page path.
export function restrictPageMethods(
  request: Request,
  next: Next
): Promise<Response> {
  const { pathname } = new URL(request.url)
  // The API handler already served the methods the route exports, so an API
  // path that gets here, even with GET or HEAD, has no handler for the method.
  const apiMethods = apiRouteMethods(pathname)
  if (apiMethods.length > 0) return methodNotAllowed(apiMethods)
  if (PAGE_METHODS.includes(request.method)) return next()
  return isPagePath({ pathname, method: request.method })
    ? methodNotAllowed(PAGE_METHODS)
    : next()
}
