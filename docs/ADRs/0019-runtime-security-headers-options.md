# 0019. The runtime package takes the security header values as options

- Status: Accepted
- Date: 2026-11-13

## Context

[ADR 0018](0018-runtime-package-middleware.md) moved the `securityHeaders` step,
`applySecurityHeaders` and their values, `SECURITY_HEADERS` and
`CSP_DIRECTIVES`, to `@evertondgn/solid-runtime`. The values were fixed in the
package: an application that needs another CSP, for an image CDN, an external
API or analytics, would have to keep its own security step. ADR 0018 recorded
that the package had to take them as options before its first publish.

The boilerplate copy reads one set of values in three places: the
`securityHeaders` step of the chain; `applySecurityHeaders` in the failure
containment, the locale step and the uncached Markdown responses; and
`vite.config.ts`, which passes `SECURITY_HEADERS` to `defineSolidApp`, whose
preset writes three of those headers on the static files.

## Decision

- `@evertondgn/solid-runtime/middleware/security-headers` exports
  `createSecurityHeaders(options)` and `requestNonce`. The factory returns
  `{ securityHeaders, applySecurityHeaders }`. The entry exports no default
  instance: if one call site imported a default instance while another used the
  configured one, the responses would leave with different headers.
- The options are `headers` and `cspDirectives`, both optional. Each one
  replaces the whole default set, and the factory copies both when it runs. The
  defaults are the values of ADR 0018, still in `constants.js` with
  `constants.d.ts`, so a fix to a default reaches the applications through a
  package update.
- The factory checks the options when it runs and throws an error that names the
  option and the reason. It refuses:
  - a `script-src`, `script-src-elem` or `script-src-attr` directive, because
    the package builds `script-src` from the request nonce;
  - two directives with the same name, because a policy uses only the first;
  - an item that does not hold exactly one directive (empty, or with `;` or
    `,`), because a second directive inside an item would come before the
    `script-src` of the package and replace it;
  - a `content-security-policy` header, in any case, because the package builds
    the CSP;
  - a header name, a header value or a directive that `Headers` cannot carry,
    such as one with a line break. Without this check the application would
    start, and `Headers` would refuse the value on every response.

  Directive names are compared without case, as the CSP parser does. A response
  never carries two directives with the same name.

- The application keeps one set of values for the three readers. In the
  boilerplate copy, `src/middleware/securityHeaders/constants.ts` spreads the
  package defaults and is where the application changes a value. It holds only
  data, because `vite.config.ts` loads it through Node.
  `src/middleware/securityHeaders/index.ts` holds the only
  `createSecurityHeaders` call and exports `securityHeaders` and
  `applySecurityHeaders`. The chain, the containment, the locale step and the
  Markdown responses import them from there; `requestNonce` still comes from the
  package. `vite.config.ts` imports `SECURITY_HEADERS` from the same
  `constants.ts`.
- The `defineSolidApp` preset and its `StaticSecurityHeaders` type do not
  change: the values of the copy match the type.

This replaces two points of ADR 0018: the consequence that the values are fixed
in the package, and the import of the package constants by the `vite.config.ts`
of the copy.

## Consequences

- An application changes a header or adds a directive in one module. In a copy
  installed by tarball, with `x-frame-options` and `strict-transport-security`
  changed and an `img-src` directive added only in `constants.ts`, the
  production build sent the new values on a page, on a Markdown response, on the
  locale redirect and in the static file rules of `.vercel/output/config.json`.
  The build with the E2E fixtures, which can make a step fail, sent them on the
  error page and on the text error of the failure containment.
- With the default values, the copy writes the same `.vercel/output/config.json`
  as before this change, and its client bundle has no module of the package.
- The type check and the type-aware lint of the copy refuse an import of the old
  names from the package entry (TS2305). Nothing refuses a second
  `createSecurityHeaders` call in the application, which would send different
  headers from two call sites; the single call is a convention of the copy,
  without a lint rule.
- The checks read the directive names and the shape of each item, not the
  values: a host in `img-src` or `'unsafe-inline'` in `style-src` passes. The
  rules of the copy about `style-src` stay in its `AGENTS.md` and in its
  security guide. `script-src` keeps the nonce and `'strict-dynamic'` in every
  application, because no option can set it.
- The static files still get only `strict-transport-security`,
  `x-content-type-options` and `cross-origin-resource-policy`; the other headers
  and the CSP reach only the function responses.
