# @evertondgn/solid-runtime

Runtime code for SolidJS applications built with Vite+. The package ships
TypeScript source, which the application's Vite compiles with its own Solid
version. It is not published yet: it stays private until its first release.

## What it has

Each module has its own entry point, with the `solid` export condition, so an
application bundles only the modules it imports.

| Entry point                               | Exports                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `./middleware/security-headers`           | `securityHeaders`, `applySecurityHeaders` and `requestNonce`: security headers, CSP and nonce |
| `./middleware/security-headers/constants` | `SECURITY_HEADERS` and `CSP_DIRECTIVES`, as JavaScript, so `vite.config.ts` can import them   |
| `./middleware/api-routes`                 | `apiRoutes`, the handler of the API routes in `virtual:file-routes`                           |
| `./middleware/restrict-page-methods`      | `restrictPageMethods`: 405 for a method that the API route or the page does not accept        |
| `./middleware/request-classification`     | `isPageRequest`, `isPagePath`, `apiRouteMethods` and `isServerFunctionPath`                   |
| `./middleware/negotiate-page-format`      | `negotiatePageFormat` and `acceptsMarkdown`                                                   |
| `./middleware/is-html-response`           | `isHtmlResponse`                                                                              |
| `./middleware/types`                      | The `Middleware` and `Next` types                                                             |

## Building the chain

The application keeps its middleware file and picks the steps. The boilerplate
copy in `apps/boilerplate` runs these three, in this order, inside its own
failure containment and after its locale and Markdown steps:

```ts
import { apiRoutes } from '@evertondgn/solid-runtime/middleware/api-routes'
import { restrictPageMethods } from '@evertondgn/solid-runtime/middleware/restrict-page-methods'
import { securityHeaders } from '@evertondgn/solid-runtime/middleware/security-headers'
import type { Middleware } from '@evertondgn/solid-runtime/middleware/types'

// The API routes get the nonce and the headers first, and the method check
// comes after them, because an API route may accept POST on a page path.
const requestMiddleware: Middleware[] = [
  securityHeaders,
  apiRoutes,
  restrictPageMethods
]
```

`vite.config.ts` passes the same header values to `defineSolidApp`, which writes
them on the static files:

```ts
import { SECURITY_HEADERS } from '@evertondgn/solid-runtime/middleware/security-headers/constants'
```

## Requirements

- The Solid Vite plugin adds the `solid` condition to the application build.
- The node project of `solidTest`, from `@evertondgn/solid-tooling/vitest`,
  resolves the package through the same condition, and the `tsconfig.app.json`
  of the tooling package sets it for TypeScript.
- `@solidjs/web` is a peer dependency, pinned to the version the package is
  tested with. `@solidjs/vite-plugin` and `filesystem-routing` are optional
  peers, pinned the same way: the entries that read the routes or the server
  functions endpoint need them.

## Limits

The header values and the CSP directives are fixed in the package. An
application that needs other values keeps its own security step for now; the
package will take them as options before its first release.

## Tests

The tests run in the Vitest of the package, with stand-ins for `server-only` and
the virtual modules of the Solid and routing plugins, and with the coverage
thresholds of an application. `vp run test` at the root runs them with the other
packages; `vp test run --coverage` runs them from this folder.
