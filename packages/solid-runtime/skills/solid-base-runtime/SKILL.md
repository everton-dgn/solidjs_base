---
name: solid-base-runtime
description: Rules for an application that uses @evertondgn/solid-runtime. Use when writing or reviewing code that imports @evertondgn/solid-runtime, the middleware chain, security headers, the CSP or a script nonce, the render entries, server functions, backend adapters and public errors, route SEO and seo.ts modules, robots.txt and sitemaps, localized links, navigation and redirects, language tags, the theme, env.ts and environment validation, fonts, Markdown pages or llms.txt.
---

# Solid Base runtime

Import each module by its own subpath, with no barrel, after checking it in
[entry points](../../docs/entry-points.md): many need the `virtual:solid-app/*`
modules of `defineSolidApp`. A section applies only when the app uses it.

## Headers, CSP and nonce (SSR)

- Call `createSecurityHeaders` once, in one module. Every step that writes a
  response imports `securityHeaders` or `applySecurityHeaders` from it, and
  `createMiddleware({ security })` gets the same instance.
- `headers` and `cspDirectives` replace the defaults: spread `SECURITY_HEADERS`
  or `CSP_DIRECTIVES` from `middleware/security-headers/constants`, and pass the
  same headers to the `securityHeaders` option of `defineSolidApp`.
- Never set `script-src`, `script-src-elem`, `script-src-attr` or a
  `content-security-policy` header there: the package builds the script policy
  from the request nonce and throws at startup.
- In production only scripts with the request nonce run, and styles come only
  from external sheets. Give every server-rendered `<script>` the nonce, and use
  classes instead of a `<style>` element or a `style` prop.
- Nothing refuses a host in `img-src` or `'unsafe-inline'` in `style-src`. The
  dev server sends no CSP: check a CSP change in a production build.

## Render entries and server errors (SSR)

- Spread `createRenderOptions()` into `renderToStream`. Never pass `onError`,
  and keep its `onCompleteAll`, so a failed render never becomes Markdown.
- Call `prepareClientLocale()` before hydration, hydrate only when
  `shouldHydrate` is true and call `dispose()` in the HMR callback.
- `serverSetup` points to `src/infra/server/configureServerErrors/index.ts`,
  which calls `configureServerErrors` once and exports nothing. With
  translations, its `publicMessage(locale)` is synchronous and returns only
  public text; it never receives the original error.
- Wrap an SDK or database adapter in `protectServerOperation({ run })`. It
  accepts plain public data and turns a failure into a fresh public error, but
  it cannot find a secret inside a string: return only the fields you selected.
- A public error comes only from `createPublicError()` of
  `server/public-errors`. Never copy the message, cause, properties, body or
  headers of an upstream error into a result.
- The lint refuses `console` (use `logServerFailure`), `fetch` outside
  `src/infra/server/requestJson/index.ts`, Node transports and `markSafeError`.

## Locales and navigation

- Without `project.inlang/settings.json` there is one unprefixed locale, the
  `language` of the preset, and `middleware/localize-request` cannot be used.
  With it, build `createLocalizeRequest({ applySecurityHeaders })` from the same
  security instance.
- Navigate with `createLocalizedNavigate()` under the Router. Call
  `createLocaleNavigationGuard()` at the Router root and
  `installLocaleHistoryGuard()` before mounting it, disposing its cleanup.
- `localizedRedirect({ href })` and `resolveLocalizedHref({ href, base })` throw
  on a relative page URL without a base. Endpoints and assets take
  `shouldLocalize: false`. `localeTag()` gives the `lang` and SEO tags.
- With translations, one server process renders requests in several locales.
  Read the locale and messages inside a component, a getter or a message
  function: a value computed at the top of a module serves every request.

## Route SEO and seo.ts (SSR)

- Call `createSeo({ route: true, site })` once in the Router's root owner, with
  `get locale()` and message getters for translated site values. The `seo`
  option and `VITE_SITE_URL` are needed for robots.txt, sitemaps, Markdown,
  llms.txt and `seo/origin`, not for head tags alone.
- A page keeps its metadata in `seo.ts` next to its `index.tsx`: export only
  `seo`, with `satisfies SeoRouteInfo` from `seo/types`, as `route.info.seo`.
  `project/seo-module` refuses another export, a relative value import, a value
  import from `src/routes/`, a computed `import()` and `import.meta.glob` there.
- Keep the page body in `index.tsx`: what `seo.ts` imports joins the initial
  bundle. `title`, `description` and `image.alt` take a message function, as in
  `title: m.about_title`, called each time the metadata resolves.

## Markdown, llms.txt and sitemaps (SSR)

- `seo: { markdown: { static: true }, llms: {}, llmsFull: {} }` turns them on;
  `llmsFull` needs `llms` and static Markdown. Importing the factory of a
  disabled feature fails the build, so remove its routes and links too.
- A page opts in with `info: { markdown: true }`, or `'dynamic'` for a
  conversion per request. `data-md-exclude` leaves an element out.
- Share one `createPublicationController()`, from a server-only module, between
  `createMarkdownContent`, in the middleware `document` slot, and
  `createSitemapRoutes`. A source reads only its `limit` and honors the signal;
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

- An SSR application validates its environment in an optional `env.ts`, as
  `{ server: { ...serverEnv } }`. Keep the preset keys when adding yours; server
  validators are synchronous.
- Read server values from `virtual:solid-env/server` in server-only code and
  public `VITE_` values from `virtual:solid-env/client`. The server module in a
  client graph fails the build, and only importing it validates at boot.
- With `env.ts`, the runtime goes in `dependencies` and the tooling stays in
  `devDependencies`. Declare Valibot only when the application imports it.
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
