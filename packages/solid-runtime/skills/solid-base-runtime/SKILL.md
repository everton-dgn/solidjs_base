---
name: solid-base-runtime
description: Rules for an application that uses @evertondgn/solid-runtime. Use when writing or reviewing code that imports @evertondgn/solid-runtime, the middleware chain, security headers, the CSP or a script nonce, the render entries, server functions, backend adapters and public errors, route SEO and seo.ts modules, robots.txt and sitemaps, localized links, navigation and redirects, language tags, the theme, env.ts and environment validation, fonts, Markdown pages or llms.txt.
---

# Solid Base runtime

Import each module by its own subpath, with no barrel, after checking it in
[entry points](../../docs/entry-points.md): many need the `virtual:solid-app/*`
modules of `defineSolidApp`. A section applies only when the app uses it.

## Headers, CSP and nonce (SSR)

- Call `createSecurityHeaders` once. Every step that writes a response, and
  `createMiddleware({ security })`, uses the instance of that one module.
- `headers` and `cspDirectives` replace the defaults: spread `SECURITY_HEADERS`
  or `CSP_DIRECTIVES` from `middleware/security-headers/constants`, and pass the
  same headers to the `securityHeaders` option of `defineSolidApp`.
- Never pass `script-src`, `script-src-elem`, `script-src-attr` or a
  `content-security-policy` header: the package builds them and refuses yours.
- Put `requestNonce()`, from `middleware/security-headers`, on each
  server-rendered script. In production, `strict-dynamic` also trusts scripts
  loaded by a trusted script. The default style policy allows external sheets;
  use classes unless the application overrides `style-src`.
- Nothing refuses a host in `img-src` or `'unsafe-inline'` in `style-src`. The
  dev server sends no CSP: check a CSP change in a production build.

## Render entries and server errors (SSR)

- Spread `createRenderOptions()` into `renderToStream`. Never pass `onError`,
  and keep its `onCompleteAll`, so a failed render never becomes Markdown.
- Call `prepareClientLocale()` before hydration. It installs the history guard;
  hydrate only when `shouldHydrate` is true and `dispose()` it on HMR.
- `serverSetup` points to `src/infra/server/configureServerErrors/index.ts`,
  which calls `configureServerErrors` once and exports nothing. Its
  `publicMessage(locale)` is synchronous and returns only public text.
- Wrap an SDK or database adapter in `protectServerOperation({ run })`: it turns
  a failure into a fresh public error, but cannot find a secret in a string, so
  return only the fields you selected.
- Create public errors only with `createPublicError()` of
  `server/public-errors`, and never copy an upstream error's message, cause,
  properties, body or headers into a result.
- The lint refuses `console` (use `logServerFailure`), `fetch` outside
  `src/infra/server/requestJson/index.ts`, Node transports and `markSafeError`.
  Tests and declarations keep only the relative import limit.

## Locales and navigation

- Without `project.inlang/settings.json` there is one unprefixed locale,
  `language`. With it, `createMiddleware` already localizes each request, and
  `createLocalizeRequest` is only for a chain of your own.
- Navigate with `createLocalizedNavigate()` under the Router and call
  `createLocaleNavigationGuard()` at its root. `installLocaleHistoryGuard()` is
  only for an entry without `prepareClientLocale()`.
- `localizedRedirect({ href })` and `resolveLocalizedHref({ href, base })` throw
  on a relative page URL without a base. Endpoints and assets take
  `shouldLocalize: false`. `localeTag()` gives the `lang` and SEO tags.
- With translations, one server process renders requests in several locales.
  Read the locale and messages inside a component, a getter or a message
  function: a value computed at the top of a module serves every request.

## Route SEO and seo.ts (SSR)

- Call `createSeo({ route: true, site })` once in the Router's root owner, with
  `get locale()` and message getters for translated site values. Head tags alone
  need neither the `seo` option nor `VITE_SITE_URL`.
- A page keeps its metadata in `seo.ts` next to its `index.tsx`: export only
  `seo`, with `satisfies SeoRouteInfo` from `seo/types`, as `route.info.seo`.
  `project/seo-module` refuses another export, a relative value import, a value
  import from `src/routes/`, a computed `import()` and `import.meta.glob` there.
- Keep the page body in `index.tsx`: what `seo.ts` imports joins the initial
  bundle. `title`, `description` and `image.alt` take a message function, as in
  `title: m.about_title`, called each time the metadata resolves.

## Markdown, llms.txt and sitemaps (SSR)

- `seo: { markdown: { static: true }, llms: {}, llmsFull: {} }` turns them on;
  `llmsFull` needs `llms` and static Markdown. A disabled feature's factory
  fails the build: remove its routes and links.
- A page opts in with `info: { markdown: true }`, or `'dynamic'` for a
  conversion per request. `data-md-exclude` leaves an element out.
- Share one `createPublicationController()`, from a server-only module, between
  `createMarkdownContent`, in the middleware `document` slot, and
  `createSitemapRoutes`. Array sources receive the signal and return the full list. A
  partitioned source also receives `limit` and bounds its query accordingly;
  never register an array and a partitioned source for one route.

## Theme

- Call `defineTheme` from `theme/define-theme` once; there is no preset option.
  Keep the `.light` and `.dark` CSS rules in the application.
- With SSR, read `readTheme(cookieHeader) ?? defaultTheme`, render a light or
  dark choice as the HTML class and `themeColor(theme)` as the meta color, and
  put `themeScript(theme)` in a `<script>` with the request nonce.
- With no server, use `storage: 'local-storage'` with a `storageKey`, and load
  `storedThemeScript` as an external file at the start of `<head>`, with no
  nonce. With SSR, keep the cookie: the server cannot read localStorage.

## Environment and fonts

- An SSR application may validate its environment in `env.ts` as
  `{ server: { ...serverEnv } }`, keeping the preset keys and synchronous
  validators.
- Read server values from `virtual:solid-env/server` in server-only code and
  public `VITE_` values from `virtual:solid-env/client`. The server module in a
  client graph fails the build, and only importing it validates at boot.
- With `env.ts`, the runtime goes in `dependencies`, the tooling in
  `devDependencies`, and Valibot only where the application imports it.
- With `fonts` in the preset, render `FontLinks` once in the SSR Document head.

## Guides

- [Runtime reference](../../docs/README.md): the task index of the guides.
- [Entry points](../../docs/entry-points.md): before importing a subpath.
- [Middleware](../../docs/middleware.md): the chain, a header or a directive.
- [Server errors](../../docs/server-errors.md): setup, adapters and entries.
- [Locale support](../../docs/i18n.md): URLs, navigation, redirects and tags.
- [SEO](../../docs/seo.md): `createSeo`, site values and robots.txt.
- [Markdown](../../docs/markdown.md): Markdown pages and llms.txt.
- [Sitemaps](../../docs/sitemaps-and-publication.md): sources and limits.
- [Theme](../../docs/theme.md): cookie or localStorage, and the scripts.
- [Environment](../../docs/env.md): `env.ts` and the `serverEnv` keys.
- [Fonts](../../docs/fonts.md): `FontLinks` in the Document.
