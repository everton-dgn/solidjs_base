# Middleware and security headers

[Runtime reference](README.md)

| Entry point                               | Exports                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `./middleware/create-middleware`          | `createMiddleware({ security, extra?, document? })`                                                           |
| `./middleware/security-headers`           | `createSecurityHeaders`, the factory of the security step and its CSP, and `requestNonce`                     |
| `./middleware/security-headers/constants` | `SECURITY_HEADERS` and `CSP_DIRECTIVES`, the default values, as JavaScript, so `vite.config.ts` can read them |
| `./middleware/api-routes`                 | `apiRoutes`, the handler of the API routes in `virtual:file-routes`                                           |
| `./middleware/restrict-page-methods`      | `restrictPageMethods`: 405 for a method that the API route or the page does not accept                        |
| `./middleware/request-classification`     | `isPageRequest`, `isPagePath`, `apiRouteMethods` and `isServerFunctionPath`                                   |
| `./middleware/negotiate-page-format`      | `negotiatePageFormat` and `acceptsMarkdown`                                                                   |
| `./middleware/is-html-response`           | `isHtmlResponse`                                                                                              |
| `./middleware/contain-failures`           | `containFailures({ chain, applySecurityHeaders })`                                                            |
| `./middleware/types`                      | The `Middleware`, `Next` and `StartMiddleware` types                                                          |

`./middleware/append-vary` and `./middleware/localize-request` are listed under
[Locale support](i18n.md).

## Building the chain

The application supplies one security instance. The same call works with or
without a translation project:

```ts
import { createMiddleware } from '@evertondgn/solid-runtime/middleware/create-middleware'
import { createSecurityHeaders } from '@evertondgn/solid-runtime/middleware/security-headers'

const security = createSecurityHeaders()
export default createMiddleware({ security })
```

With `project.inlang/settings.json` the preset selects request localization.
Without it, the request step passes through directly, with no translation
provider, locale cookie or redirect. The optional
`virtual:solid-app/request-middleware` seam keeps the request provider out of
single-language bundles; direct imports of `middleware/localize-request` still
require a translation project.

The request order is localization, then `extra`, security headers, API routes
and page-method restrictions. Inner containment runs inside the locale context;
outer containment covers locale resolution. API handlers may terminate the
chain, so security must run before them. Development rethrows the original
failure. Production preserves only bodyless controls and produces public
failures with the application's configured headers. `serverFailure` is part of
the runtime's request-locals augmentation; applications must not redeclare it.
The application error boundary consumes it before mounting its Router.

An optional `document` step accepts the Solid plugin event and next callback. It
wraps the localized chain with its own containment. A request replacement made
by that step reaches the locale step and render; a failure before entering the
chain renders its fallback inside the request locale. A failure after the render
never renders a second time. The boilerplate app supplies Markdown:

```ts
import { createMiddleware } from '@evertondgn/solid-runtime/middleware/create-middleware'
import { markdownContent } from './markdownContent/index.ts'
import { securityHeaders, applySecurityHeaders } from './securityHeaders/index.ts'

export default createMiddleware({
  security: { securityHeaders, applySecurityHeaders },
  document: markdownContent
})
```

Omitting `document` avoids that adapter and its extra containment layer. The
factory does not configure the global error hook: retain the application's
`serverSetup` registration. Custom chains can call
`containFailures({ chain, applySecurityHeaders })` directly with the same
security instance. Failures after returning a Response body remain outside the
containment window. See
[ADR 0029](https://github.com/everton-dgn/solidjs_base/blob/main/docs/ADRs/0029-runtime-middleware-chain.md).

## Security headers

The application calls `createSecurityHeaders` once, in its own module, and every
step that writes a response imports `securityHeaders` or `applySecurityHeaders`
from there, so all responses carry the same values. `requestNonce` comes from
the package. The options are `headers` and `cspDirectives`; each one replaces
the whole default set, so spread the defaults to change one value. The
boilerplate app keeps the values in a data-only module, which `vite.config.ts`
also reads. In this example, the application changes one header and adds one
directive; the boilerplate app itself keeps the defaults:

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
name, a header value or a directive that a response cannot carry, such as one
with a line break or another control character, fails the same way, when the
application starts.

The development server sends the fixed headers without a CSP, because hot module
replacement uses inline styles; the production policy allows only external style
sheets. Only HTML documents run scripts: text, XML, JSON and redirects get
`script-src 'none'`.

## Limits

- `createSecurityHeaders` checks the directive names, the shape of each item and
  whether the resulting policy can be sent as an HTTP header. The application
  chooses the permitted sources, so a host in `img-src` or `'unsafe-inline'` in
  `style-src` passes these checks.
- Nothing refuses a second `createSecurityHeaders` call in the application. Two
  instances with different values would send different headers from two call
  sites.
