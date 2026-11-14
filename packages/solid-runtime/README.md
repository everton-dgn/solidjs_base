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
name, a header value or a directive that a response cannot carry, such as one
with a line break or another control character, fails the same way, when the
application starts.

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
