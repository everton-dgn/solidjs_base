# 0029. Middleware composition and entry helpers belong to the runtime

- Status: Accepted
- Date: 2026-11-14

## Context

Applications still copied the failure boundary and middleware order after the
individual steps moved to the runtime. Both are security contracts: an escaped
error can reach the host log, and a response that bypasses security can lose CSP
or other headers. Authored entries also repeated render integrity, cancellation
and pre-hydration locale handling.

## Decision

Export `createMiddleware({ security, extra?, document? })` and
`containFailures({ chain, applySecurityHeaders })` through separate middleware
subpaths. The application must supply its `createSecurityHeaders` instance;
there is no implicit default instance. The request chain keeps extra steps,
security, API routes and method restrictions in that order. Localization wraps
the inner containment, and outer containment covers resolution failures.

The optional `document` callback uses the plugin event contract. It wraps that
chain and has its own containment. If it fails before localization, its fallback
enters the locale context; after rendering, it cannot render again. Without the
callback the factory returns the shorter event adapter. The application's
Markdown step remains outside the package.

The tooling's `virtual:solid-app/request-middleware` module selects
`createLocalizeRequest` only when a translation project exists. Otherwise it
provides a direct next call, without importing the request provider. Existing
locale-request imports still require a translation project, preserving ADR 0023
and the matrix's absence-of-provider checks. No dependency ownership changes.

The runtime declares `RequestEventLocals.serverFailure`. Its middleware types
load the shared declaration, so installed consumers receive it without an app
declaration. The existing exact-file interface lint exception remains
sufficient.

`createRenderOptions()` creates and installs render integrity before rendering,
forwards nonce and signal, and supplies `onCompleteAll`. It deliberately leaves
`onError` to the global server setup. `prepareClientLocale({ reload? })` reloads
on a mismatch between the loaded navigation locale and current URL, or installs
the history guard and returns its cleanup with `shouldHydrate: true`.

Applications retain their authored client/server trees, Document's literal
`/src/entry-client.tsx`, error boundary and the server setup. Outdated-page
detection remains application policy because it coordinates notices, unsaved
changes and a single client error/response hook. The entry still owns HMR
cleanup for that detection and the locale helper.

## Verification

The 54 containment tests move with their assertions and parameterized cases. The
request-locale case uses the runtime's independent French test provider. The
copy keeps its 18 chain and Markdown integration cases. New runtime tests cover
configured headers before a terminating API, both containment contexts, document
replacement/failure, native render completion/cancellation and client locale
preparation. The client-only fixture checks preparation without i18n.

Both installed SSR scenarios use the factory and entry helpers under both Bun
linkers. Additional smoke assertions check middleware failures, controls,
headers, locale and private markers. Optional `middleware-body` and
`middleware-headers` mutations affect only temporary installed copies; swapping
security and API in the factory must fail the runtime order regression. See
[ADR 0021](0021-installed-application-scenarios.md).

## Consequences and limits

Derived applications remove their local containment and locals declaration and
configure the package factory. The boilerplate keeps a small binding that lets
its E2E entry prepend extra steps to the same production chain. Header values,
Markdown and public message catalogs remain application-owned.

Development still rethrows. Production still recognizes cancellation only by
identity with the aborted request signal. The boundary does not cover failures
while creating the event or sending a body after returning the Response.
Installed previews do not prove hydration, streamed CSS or deployment; the
copy's complete suites retain FragmentCss, BackendError, OutsideError,
OutdatedPage and the production log teardown.
