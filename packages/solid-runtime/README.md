# @evertondgn/solid-runtime

Runtime code for SolidJS applications built with Vite+. The package ships
TypeScript source, which the application's Vite compiles with its own Solid
version. It is not published yet: it stays private until its first release.

## What it has

Each module has its own entry point, with the `solid` export condition, so an
application bundles only the modules it imports.

| Entry point                               | Exports                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `./middleware/security-headers`           | `createSecurityHeaders`, the factory of the security step and its CSP, and `requestNonce`                     |
| `./middleware/security-headers/constants` | `SECURITY_HEADERS` and `CSP_DIRECTIVES`, the default values, as JavaScript, so `vite.config.ts` can read them |
| `./middleware/api-routes`                 | `apiRoutes`, the handler of the API routes in `virtual:file-routes`                                           |
| `./middleware/restrict-page-methods`      | `restrictPageMethods`: 405 for a method that the API route or the page does not accept                        |
| `./middleware/request-classification`     | `isPageRequest`, `isPagePath`, `apiRouteMethods` and `isServerFunctionPath`                                   |
| `./middleware/negotiate-page-format`      | `negotiatePageFormat` and `acceptsMarkdown`                                                                   |
| `./middleware/is-html-response`           | `isHtmlResponse`                                                                                              |
| `./middleware/types`                      | The `Middleware` and `Next` types                                                                             |

## Building the chain

The application keeps its middleware file and picks the steps. The boilerplate
copy in `apps/boilerplate` runs these three, in this order, inside its own
failure containment and after its locale and Markdown steps:

```ts
import { apiRoutes } from '@evertondgn/solid-runtime/middleware/api-routes'
import { restrictPageMethods } from '@evertondgn/solid-runtime/middleware/restrict-page-methods'
import type { Middleware } from '@evertondgn/solid-runtime/middleware/types'

import { securityHeaders } from './securityHeaders/index.ts'

// The API routes get the nonce and the headers first, and the method check
// comes after them, because an API route may accept POST on a page path.
const requestMiddleware: Middleware[] = [
  securityHeaders,
  apiRoutes,
  restrictPageMethods
]
```

## Security headers

The application calls `createSecurityHeaders` once, in its own module, and every
step that writes a response imports `securityHeaders` or `applySecurityHeaders`
from there, so all responses carry the same values. `requestNonce` comes from
the package. The options are `headers` and `cspDirectives`; each one replaces
the whole default set, so spread the defaults to change one value. The
boilerplate copy keeps the values in a data-only module, which `vite.config.ts`
also reads. In this example, the application changes one header and adds one
directive; the copy itself keeps the defaults:

```ts
// src/middleware/securityHeaders/constants.ts
import {
  CSP_DIRECTIVES as PACKAGE_CSP_DIRECTIVES,
  SECURITY_HEADERS as PACKAGE_SECURITY_HEADERS
} from '@evertondgn/solid-runtime/middleware/security-headers/constants'

export const SECURITY_HEADERS = {
  ...PACKAGE_SECURITY_HEADERS,
  'x-frame-options': 'SAMEORIGIN'
}

export const CSP_DIRECTIVES = [
  ...PACKAGE_CSP_DIRECTIVES,
  "img-src 'self' https://images.example"
]
```

```ts
// src/middleware/securityHeaders/index.ts
import { createSecurityHeaders } from '@evertondgn/solid-runtime/middleware/security-headers'

import { CSP_DIRECTIVES, SECURITY_HEADERS } from './constants.ts'

export const { securityHeaders, applySecurityHeaders } = createSecurityHeaders({
  headers: SECURITY_HEADERS,
  cspDirectives: CSP_DIRECTIVES
})
```

`vite.config.ts` passes the same header values to `defineSolidApp`, which writes
three of them on the static files:

```ts
import { SECURITY_HEADERS } from './src/middleware/securityHeaders/constants.ts'
```

`createSecurityHeaders` throws when `cspDirectives` has a `script-src`,
`script-src-elem` or `script-src-attr` directive, which the package builds from
the request nonce; two directives with the same name; or an item that does not
hold exactly one directive. It also throws when `headers` has a
`content-security-policy` key, in any case: the package builds the CSP. A header
name, a header value or a directive that a header cannot carry, such as one with
a line break, fails the same way, when the application starts.

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

- `createSecurityHeaders` checks the directive names and the shape of each item,
  not the values: a host in `img-src` or `'unsafe-inline'` in `style-src`
  passes.
- Nothing refuses a second `createSecurityHeaders` call in the application. Two
  instances with different values would send different headers from two call
  sites.

## Tests

The tests run in the Vitest of the package, with stand-ins for `server-only` and
the virtual modules of the Solid and routing plugins, and with the coverage
thresholds of an application. `vp run test` at the root runs them with the other
packages; `vp test run --coverage` runs them from this folder.
