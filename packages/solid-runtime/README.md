# @evertondgn/solid-runtime

Runtime code for SolidJS applications built with Vite+. The package ships
TypeScript source, which the application's Vite compiles with its own Solid
version, plus plain JavaScript for entries loaded from Node. It is not published
yet: it stays private until its first release.

## What it has

Each module has its own entry point, so an application bundles only the modules
it imports. TypeScript entries use the `solid` condition. The env fragment and
header constants use `types` and `default` for plain Node compatibility.

| Entry point                               | Exports                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `./env`                                   | `serverEnv`: optional `HOST`, `PORT` and `BASE_URL_TEST` schemas, as JavaScript with declarations             |
| `./middleware/security-headers`           | `createSecurityHeaders`, the factory of the security step and its CSP, and `requestNonce`                     |
| `./middleware/security-headers/constants` | `SECURITY_HEADERS` and `CSP_DIRECTIVES`, the default values, as JavaScript, so `vite.config.ts` can read them |
| `./middleware/api-routes`                 | `apiRoutes`, the handler of the API routes in `virtual:file-routes`                                           |
| `./middleware/restrict-page-methods`      | `restrictPageMethods`: 405 for a method that the API route or the page does not accept                        |
| `./middleware/request-classification`     | `isPageRequest`, `isPagePath`, `apiRouteMethods` and `isServerFunctionPath`                                   |
| `./middleware/negotiate-page-format`      | `negotiatePageFormat` and `acceptsMarkdown`                                                                   |
| `./middleware/is-html-response`           | `isHtmlResponse`                                                                                              |
| `./middleware/create-middleware`          | `createMiddleware({ security, extra?, document? })`                                                           |
| `./middleware/contain-failures`           | `containFailures({ chain, applySecurityHeaders })`                                                            |
| `./middleware/types`                      | The `Middleware`, `Next` and `StartMiddleware` types                                                          |

## Server error protection

The server entries use the `solid` condition and retain `server-only`. A used
import from a client entry fails the build. There is no barrel.

| Entry                               | Exports                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `./server/configure-server-errors`  | `configureServerErrors`                                                                                       |
| `./server/public-errors`            | `createPublicError`, `isPublicError`, `publicErrorMessage`                                                    |
| `./server/protect-server-operation` | `protectServerOperation`                                                                                      |
| `./server/log-server-failure`       | `logServerFailure`                                                                                            |
| `./server/is-control-response`      | `isControlResponse`                                                                                           |
| `./server/render-integrity`         | `createRenderIntegrity`, `markRenderFailure`, `observeRenderFailures`                                         |
| `./server/publication-scope`        | `withPublicationScope`, `assertPublicationActive`, `isPublicationCancellation`, `observePublicationOperation` |

Point `defineSolidApp` at the application's privileged setup path:

```ts
serverSetup: './src/infra/server/configureServerErrors/index.ts'
```

Without translations, that file only registers the protection:

```ts
import { configureServerErrors } from '@evertondgn/solid-runtime/server/configure-server-errors'

configureServerErrors()
```

With translations, the same file passes its own synchronous public text:

```ts
import { configureServerErrors } from '@evertondgn/solid-runtime/server/configure-server-errors'
import { m } from '@paraglide/messages.js'
import { isLocale } from '@paraglide/runtime.js'

configureServerErrors({
  publicMessage: locale => {
    if (!isLocale(locale)) throw new Error('Unsupported public message locale')
    return m.configureServerErrors_message({}, { locale })
  }
})
```

`publicMessage?: (locale: string) => string` receives the request locale from
`i18n/locale`. The runtime does not import the application's translation
provider. With no callback, failed locale resolution, a throwing callback or an
invalid callback result, the message is `The request could not be completed.`.
Failures do not log or reuse the callback error. A callback has no access to the
original error and must return only public text. Calling the configurator again
replaces the callback and hooks; setup should call it once.

`protectServerOperation({ run })` preserves synchronous and asynchronous return
shapes while checking plain public data. It creates a fresh public error for
failures, even when the previous error was already public. The public type
rejects `allowControl` when the field is present in the argument's static type,
including variables and spreads. A value narrowed to `{ run: () => T }` can
retain that extra field without a type diagnostic; the wrapper still forwards
only `run` and discards extra options. Only the private global registration
variant enables framework controls. Neither that variant nor the message setter
has a subpath. The application keeps `requestJson`, the shared controller
instance and source registries, its document adapter and authored render trees.
The runtime owns middleware containment and the shared entry helpers. Production
logs contain only the fixed source line and filtered class/frames; development
diagnostics retain the existing original-error behavior.

The tooling lint reserves the configurator and `observeRenderFailures` for
`src/infra/server/configureServerErrors/index.ts`, which must not export
anything in applications. Production imports cannot contain a `node_modules`
path segment; consumers use the package's public exports. Backend import
restrictions normalize dot segments and repeated separators before matching
paths. Test helpers live in `tooling/testing`, outside the tarball and coverage.
Installed SSR scenarios check bodies and drained preview logs with both Bun
linkers, German messages, callback fallback and the client build barrier. See
[ADR 0028](../../docs/ADRs/0028-runtime-server-errors.md).

## Locale support

The entries `./i18n/locale`, `./i18n/urls`, `./i18n/build-locale-alternates` and
`./middleware/append-vary` provide the locale contract, URL helpers, alternate
links and Vary header merging.

`./i18n/locale` exports `locales`, `baseLocale`, `getLocale`, `setLocale`,
`extractLocaleFromUrl`, `localizeHref` and `deLocalizeUrl`, with locales typed
as strings. Its `localizeHref(href, options?)` follows the provider contract;
the URL helper entry takes `localizeHref({ href, locale })` and preserves
external links. There is no production translation dependency in this package.

The preset supplies `virtual:solid-app/locale` in builds, development and all
three Vitest projects. With an application translation project it forwards the
generated runtime. Otherwise the single locale is `language` (default `en`),
links and URLs remain unprefixed, and URL locale extraction returns undefined.
`setLocale(locale, { reload? })` forwards the generated provider; without a
translation project it does nothing, never reloads and keeps `language`.
Applications using the preset need no locale setup. The tooling app tsconfig
loads the virtual module declarations.

Runtime tests use an independent three-locale provider (fr, de, ja). They test
the helper contracts; installed application scenarios test the real providers.

### Navigation and language tags

Each entry is independent, with no barrel:

| Entry point                             | Export                               |
| --------------------------------------- | ------------------------------------ |
| `./i18n/create-localized-navigate`      | `createLocalizedNavigate()`          |
| `./i18n/create-locale-navigation-guard` | `createLocaleNavigationGuard()`      |
| `./i18n/install-locale-history-guard`   | `installLocaleHistoryGuard(reload?)` |
| `./i18n/locale-tag`                     | `localeTag(locale?, overrides?)`     |

Call `createLocalizedNavigate` under the application's Router. Its returned
function takes `{ href, locale?, shouldLocalize?, ...navigateOptions }` and
preserves relative paths, query strings, fragments, state and replace behavior.
An explicit different locale, an external URL or `shouldLocalize: false` uses
document navigation. Router state and scroll options apply only to SPA
navigation. Call `createLocaleNavigationGuard` at the Router root to cover
action and query redirects, and install the history guard before mounting the
Router. Dispose its returned listener cleanup on teardown or HMR.

`localeTag()` reads the provider on each call. It uses `Intl.Locale` to
canonicalize a BCP 47 tag, preserving scripts, regions and extensions without
guessing a region or maintaining a locale list. Pass a map keyed by locale to
override specific tags; missing entries use the locale itself. Invalid tags
throw the native `RangeError`. Without translations, the default is the preset's
`language`, or `en` when omitted.

```tsx
import { createLocalizedNavigate } from '@evertondgn/solid-runtime/i18n/create-localized-navigate'
import { localeTag } from '@evertondgn/solid-runtime/i18n/locale-tag'

// Inside a component under the Router:
const navigate = createLocalizedNavigate()
const goToGuide = () => navigate({ href: '/guide?q=1#intro' })
const language = localeTag('fr', { fr: 'fr-CA' }) // fr-CA
```

The application keeps its link component, regional overrides and locale
switcher. Navigation modules read only the locale seam, with no direct
translation imports. Their moved DOM and real-browser tests use the generated
de/fr/ja test project. `@solidjs/router`, like `solid-js`, is supplied by the
application; this extraction preserves peer dependencies and ownership.

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
never renders a second time. The boilerplate supplies Markdown:

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
containment window.

## Authored render entries

`server/create-render-options` exports `createRenderOptions()`. Call it before
rendering and spread the returned options into `renderToStream` alongside the
application manifest. It installs the render-integrity state, forwards the event
nonce and cancellation signal, and completes the state through `onCompleteAll`.
It never supplies `onError`, which would override the global error policy. Keep
that completion callback when adding options.

`i18n/prepare-client-locale` exports `prepareClientLocale({ reload? })`. Before
hydration it compares the loaded navigation locale with the current URL. A
mismatch reloads and returns `shouldHydrate: false`. Otherwise it installs the
history guard and returns `shouldHydrate: true` and `dispose()`. Register that
cleanup in the entry's existing HMR callback. It also works with the
single-language provider. Both entries are inert until called.

The application retains its client/server entry pair, identical authored tree,
Document's literal `/src/entry-client.tsx`, hydration instrumentation and
outdated-page policy. See
[ADR 0029](../../docs/ADRs/0029-runtime-middleware-chain.md).

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
name, a header value or a directive that a response cannot carry, such as one
with a line break or another control character, fails the same way, when the
application starts.

## Optional SEO

SEO entries use the `solid` condition and have no shared server barrel:

| Entry                     | API                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./seo/create-seo`        | `createSeo({ route: true, site, localeTagOverrides?, markdownHref? })` or `createSeo({ structuredData })`                                             |
| `./seo/resolve-route-seo` | `resolveRouteSeo({ metadata, site })` merges parent-to-child metadata                                                                                 |
| `./seo/types`             | `SeoSite`, `SeoRouteInfo`, `SeoMetadata`, `SeoImage`, `SeoArticle`, `RouteSeoOptions`, `RobotsGroup`, `RobotsOptions` and the router SEO augmentation |
| `./seo/origin`            | `origin`, the normalized configured HTTP(S) origin                                                                                                    |
| `./seo/create-robots`     | `createRobots({ groups, sitemaps?, cacheControl? })` returns a GET handler                                                                            |
| `./seo/robots-route`      | `GET`, bound to the preset's robots data                                                                                                              |

In an SSR application, enable the optional preset configuration and define
`VITE_SITE_URL=https://example.com` in its environment:

```ts
export default defineSolidApp({
  root: import.meta.dirname,
  securityHeaders: SECURITY_HEADERS,
  seo: { robots: { groups: [{ userAgents: ['ExampleBot'], disallow: ['/private'] }] } }
})
```

The robots route is one line:

```ts
export { GET } from '@evertondgn/solid-runtime/seo/robots-route'
```

The preset route prepends the wildcard group allowing `/` and disallowing the
Solid server-function endpoint. The route supports GET and router-provided HEAD
with the same headers. It caches text in production with
`public, max-age=0, s-maxage=3600, stale-if-error=86400`; development defaults
to `no-store`. Set `cacheControl` to replace that policy. The preset's
`sitemapPaths` resolves explicit paths against the origin; with no paths there
are no `Sitemap:` lines. The separate sitemap factory below generates sitemap
responses.

Pass editorial values explicitly, then call the primitive once in the Router's
root owner:

```ts
import { getLocale } from '@evertondgn/solid-runtime/i18n/locale'
import { createSeo } from '@evertondgn/solid-runtime/seo/create-seo'
import { origin } from '@evertondgn/solid-runtime/seo/origin'
import type { SeoSite } from '@evertondgn/solid-runtime/seo/types'

const site = {
  title: 'Example',
  description: 'Example application',
  url: origin,
  get locale(): string { return getLocale() },
  image: { path: '/cover.png', width: 1200, height: 630, alt: 'Example cover' }
} satisfies SeoSite

function registerRouteSeo(): void {
  createSeo({ route: true, site })
}
```

Without i18n, the locale seam uses `language` (default `en`) and keeps paths
unprefixed. With an Inlang project the same API reads its generated provider;
use message getters for translated editorial values and `localeTagOverrides` for
regional tags. No runtime SEO module imports Paraglide directly.

For meta and JSON-LD only, omit the preset's `seo` option and the robots route,
replace the `origin` import with an explicit `site.url`, and keep the same
`createSeo` call. No environment origin is required. A structured-data-only call
does not need a site or a Router:

```ts
createSeo({ structuredData: () => ({ '@type': 'Thing', name: 'Example' }) })
```

Client-only applications can omit all SEO imports and the `seo` option. The
installed matrix checks that no SEO module enters that profile. The preset
rejects `seo` together with `ssr: false`, as it does other SSR options.

The origin entry and enabled preset option require an HTTP(S) origin with no
path, query, fragment or credentials. `originEnv` selects another environment
key. Omitting SEO or setting it to `false` leaves unused origin values alone;
importing the origin entry still validates it. The virtual modules contain only
serialized origin and robots data, never application module paths or imports.

Site title, description, URL, locale and image are required. Author,
organization, logo and social fields are optional. Omitted organization removes
the Organization node and publisher references; omitted author removes Person
and its social tag. There are no example identities in runtime defaults.
`resolveRouteSeo` is public so index consumers can share inheritance rules
without importing the head publisher. Page types and augmentation travel through
type-only imports.

Both route graphs and custom data escape `<`, U+2028 and U+2029 before reaching
`useHead`. This preserves JSON values while preventing script delimiters from
appearing literally. `noindex` routes publish only robots, title and
description; explicit structured-data calls remain independent. `markdownHref`
only supplies an optional alternate URL; Markdown rendering and publication stay
in the app. `schema-dts` is a type dependency supplied by the runtime; declare
it directly when application code imports its types.

## Optional environment validation

An SSR application can add `env.ts`:

```ts
import { serverEnv } from '@evertondgn/solid-runtime/env'

const env = { server: { ...serverEnv } }

export default env
```

All three keys are optional; `PORT` converts decimal digits to an integer from 0
through 65535. Spread the fragment into the plugin's `server` map and add
application keys to `server` or `client`. Applications without env requirements
can omit the file. The separate SEO option validates `VITE_SITE_URL` only when
enabled or when the origin entry is imported.

The entry is plain JavaScript with a handwritten declaration, without the
`solid` condition. It loads in Node and Vite's module runner and enters the
server bundle when `virtual:solid-env/server` is imported. Contract tests bind
the declaration to the runtime outputs. The runtime supplies Valibot; only an
application that imports Valibot itself needs a direct dependency. The tooling
stays in `devDependencies`, outside production-only installations. Env
validation adds neither the fragment nor Valibot to the client bundle. See the
[environment guide](../../docs/tooling/app-config.md#optional-environment-validation)
for extension examples, boot validation and type generation.

## Requirements

- The Solid Vite plugin adds the `solid` condition to the application build for
  the TypeScript entries.
- The node project of `solidTest`, from `@evertondgn/solid-tooling/vitest`,
  resolves the package through the same condition, and the `tsconfig.app.json`
  of the tooling package sets it for TypeScript.
- `@solidjs/web` is a peer dependency, pinned to the version the package is
  tested with. `@solidjs/vite-plugin` and `filesystem-routing` are package
  dependencies: the middleware type and routing helpers resolve from the runtime
  package. Applications retain a direct routing dependency only when their own
  source imports it.

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
packages; `vp run test` generates the test provider and runs them with coverage
from this folder.

The package is checked from this folder as an application. The `check` script
runs the test provider generator and `vp lint`, which applies the lint preset of
`@evertondgn/solid-tooling`, loaded from its sources, and checks the types. The
`dead-code` script runs Knip, which takes the entries from `exports`. The
`test:tarball` script packs the package, extracts it to the `node_modules` of a
temporary folder and checks that the header constants load in plain Node, that
every target of `exports` is in the tarball and that no `__tests__` folder is
published. At the root, `vp run validate` runs all of them with the other
packages.

## Locale request middleware

Applications with project.inlang/settings.json can import
`createLocalizeRequest` from `./middleware/localize-request` and
`localizedRedirect` from `./i18n/localized-redirect`. Construct the step with
`createLocalizeRequest({ applySecurityHeaders })`, using the application's
security header instance. Cookie persistence stays internal to that entry. The
runtime declares `RequestEventLocals.localizedPageBase`.

The preset supplies `virtual:solid-app/locale-request` from the application's
generated runtime and server modules, including in the Node Vitest project.
Without a translation project its functions throw an error naming
`project.inlang/settings.json`. Applications that do not import these entries do
not load the request provider.

The test command first generates an independent de/fr/ja Paraglide project into
`tooling/testing/generated/`, ignored by Git and excluded from the tarball. The
generator is a development dependency only.

## Optional theme

Import `@evertondgn/solid-runtime/theme/define-theme` explicitly. Applications
without theme imports bundle no theme modules; there is no preset option.

```ts
import { defineTheme } from '@evertondgn/solid-runtime/theme/define-theme'

export const { createTheme, readTheme, themeColor, themeScript, defaultTheme, themes } =
  defineTheme({
    cookieName: 'app-theme',
    cookieMaxAge: 31536000,
    colors: { light: '#ffffff', dark: '#09090b' },
    defaultTheme: 'system'
  })
```

Read the request cookie with `readTheme(cookieHeader) ?? defaultTheme`. Use an
explicit light/dark preference as the HTML class and `themeColor(theme)` as the
meta color. Render `themeScript(theme)` inside your own script with the request
nonce. Keep .light/.dark color-scheme CSS rules in the application. The factory
validates cookieName, positive integer cookieMaxAge, nonempty
colors.light/colors.dark and defaultTheme, and copies the configuration. Colors
remain application-owned CSS values; validation does not parse CSS. readTheme
returns null for absent/invalid preferences and undefined for blocked access.
themeColor uses light for system during SSR; the script resolves the actual
system preference before hydration.

Call createTheme once per provider tree. It applies choices before persistence,
uses the cookie name for BroadcastChannel, and reconciles focus, pageshow and
visibility changes. No localStorage is used.

Separate entries also expose `theme/types`, `theme/is-theme`,
`theme/apply-theme`, `theme/theme-storage`, `theme/make-system-theme`,
`theme/make-theme-channel`, `theme/make-broadcast-channel`, `theme/create-theme`
and `theme/create-theme/types`. Storage, theme channel and primitive take
ThemeOptions as their first argument. The factory binds those options for normal
application use.

The application continues to supply `solid-js`; this extraction does not change
peerDependencies or move dependency ownership. Knip's strict production pass has
a scoped `solid-js!` exception for that existing consumer dependency. Installed
builds exercise resolution with both Bun linkers. Test support under
`src/tests/` is excluded from the published tarball and coverage.

## Sitemap and publication

`@evertondgn/solid-runtime/server/publication` exports
`createPublicationController(limits?)`. Create one instance per application in a
server-only module and inject it into sitemap and Markdown. Creating a separate
instance for each handler doubles the intended local quotas. `getMetrics()`
returns a snapshot; the application decides where to expose observability.

```ts
// src/infra/server/publication/index.ts
import 'server-only'
import { createPublicationController } from '@evertondgn/solid-runtime/server/publication'

export const publication = createPublicationController()
export const runPublication = publication.runPublication
```

Bind explicit application sources to the factory. The example is complete and
uses a finite in-memory catalog; replace the read inside the server-only source
with an adapter that honors the requested limit and signal.

```ts
// src/infra/server/sitemap/index.ts
import 'server-only'
import { createSitemapRoutes } from '@evertondgn/solid-runtime/seo/sitemap-routes'
import { origin } from '@evertondgn/solid-runtime/seo/origin'
import type { SitemapPartitionSource } from '@evertondgn/solid-runtime/seo/sitemap-types'
import { publication } from '../publication/index.ts'

const sources: readonly SitemapPartitionSource[] = [{
  id: 'articles',
  routePath: '/articles/:id',
  listPartitions: ({ limit, signal }) => {
    signal.throwIfAborted()
    return Promise.resolve(['first'].slice(0, limit))
  },
  readPartition: ({ id, limit, signal }) => {
    signal.throwIfAborted()
    const entries = id === 'first' ? [{ path: '/articles/42' }] : []
    return Promise.resolve(entries.slice(0, limit))
  }
}]

export const { index, pages, source, array } = createSitemapRoutes({
  sources, publication, siteUrl: origin
})
```

Re-export these handlers as `GET` in `/sitemap.xml`,
`/sitemaps/pages/[part].xml`, `/sitemaps/[source]/[part].xml` and
`/sitemaps/array.xml`, respectively. The page route `/articles/[id]` must exist
and be indexable. `HEAD` preserves status and headers with no body. A missing
`.xml` suffix or missing part returns an empty 404 with `no-store`.

A small dynamic route may instead declare an array source. Importing its type
includes the `RouteInfo.sitemap` augmentation without importing a server module.
Its route metadata must cross a server function before reaching private data:

```ts
// src/routes/catalog/[id]/listCatalog.ts
import type { SitemapEntry } from '@evertondgn/solid-runtime/seo/sitemap-types'

export async function listCatalog(signal: AbortSignal): Promise<SitemapEntry[]> {
  'use server'
  signal.throwIfAborted()
  return await Promise.resolve([{ path: '/catalog/42', lastmod: '2026-10-02' }])
}
```

The page declares `export const route = { info: { sitemap: listCatalog } }`. Do
not register an array and partitioned source for the same route. Array sources
return complete lists; for larger data sets use partitions whose query itself
applies `limit`. Validation after allocation cannot bound a bad query.

Both examples work without `project.inlang`: one unprefixed URL per entry, no
language alternates, no Paraglide dependency. With the existing i18n setup, the
same API emits every configured locale and `x-default` for the base locale. Keep
each locale group together within one part.

In `defineSolidApp`,
`seo: { sitemap: true, robots: { sitemapPaths: ['/sitemap.xml'] } }` enables the
static sitemap header rules and advertises the root. Routes are explicit
application files. To disable sitemap, remove those routes, their server binding
and array metadata; omit `seo.sitemap` and the robots `sitemapPaths`. Robots can
remain installed. No sitemap service is imported by the ordinary SEO or robots
entries.

| Option                                                      | Default and constraint                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `createPublicationController({ total, sitemap, markdown })` | 4 total, 2 per kind; positive safe integers                                                   |
| `sources`, `perSource`                                      | 4 concurrent source reads, 2 per source object                                                |
| `outputs`, `reservedBytes`                                  | 4 live outputs, 16,777,216 reserved bytes                                                     |
| `createSitemapRoutes({ timeoutMs })`                        | 10,000 ms for the full dynamic operation                                                      |
| `byteBudget`                                                | 4,194,304 bytes; at most 52,428,800 uncompressed XML bytes                                    |
| `cacheControl`                                              | Production: `public, max-age=0, s-maxage=3600, stale-if-error=86400`; development: `no-store` |
| `usesArtifacts`                                             | `false`; set `true` only with the application artifact writer and prerender integration       |

A sitemap has at most 50,000 localized URLs, a location has at most 2,048
characters, and an index has at most 50,000 parts. These protocol bounds are not
application tunables. `listPartitions` receives the remaining index capacity
plus one; `readPartition` receives `floor(50000 / locales.length) + 1` to detect
overflow. Both receive the publication `AbortSignal`. Oversized sources fail
with empty 503 `no-store`, never partial successful XML. Overload also carries
`Retry-After: 1`. No internal queue or retry is added.

Route collection, matching and the partition registry scale with the complete
route/source set and are cached per factory in production. Direct mode retains
that route inventory in memory. The index enumerates partition IDs within its
count/byte budget and reads complete array sources on each request. A part reads
only its selected source and bounded batch; XML construction still holds that
batch and its string/encoded body. The controller reserves output bytes, not
every allocation made by the application or database driver. Each process has
independent quotas. A source ignoring cancellation occupies its slot until
settlement; recycle a stuck instance using the host's procedure after fixing the
adapter. Process caches are neither persistent storage nor global quotas.

The copy's artifact path persists static XML and generation-bound manifests. Its
reader loads identities only for array-source collision checks and refuses
missing, oversized or mismatched artifacts without rebuilding on a request.
`inventory` is a fifth handler restricted to prerender, used by that build
integration. `tooling/publicationArtifacts` and `tooling/markdownPrerender` stay
application-owned. They share the plain-JavaScript `server/publication-protocol`
entry with the server reader; handwritten literal declarations are tied to
values by a regression test. `server/publication-phase` and
`routing/walk-static-routes` support the remaining application publishers.
