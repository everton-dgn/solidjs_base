# Solid Base application

This SolidJS application uses the Solid Base tooling and runtime.

> [!NOTE]
> This app pins SolidJS 2 in its [package manifest](package.json) to the version
> the packages are tested with.

The home page, captured from the production build at 750 px wide:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/app-home-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="../../docs/assets/readme/app-home-light.webp" />
  <img src="../../docs/assets/readme/app-home-light.webp" alt="The boilerplate app's home page at /en, captured from its production build." width="800" />
</picture>

[See it work](#see-it-work) · [Running it](#running-it) ·
[What each page and feature shows](#what-each-page-and-feature-shows) ·
[How it is tested](#how-it-is-tested) · [Limits](#limits) ·
[Reference](#reference)

## See it work

### The same page as Markdown and llms.txt

The about page answers as HTML to a browser and as Markdown to a client that
sends `Accept: text/markdown`. The Markdown response points to `/llms.txt`, the
index of the pages that opt in. This example uses a production build served on
port 4419.

```text
$ curl -s -D - -H 'Accept: text/markdown' http://127.0.0.1:4419/en/about
HTTP/1.1 200
cache-control: private, no-store
content-language: en
content-security-policy: default-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; script-src 'none'
content-type: text/markdown; charset=utf-8
link: </llms.txt>; rel="describedby"
vary: Cookie, Accept

# About SolidJS Boilerplate

SolidJS Boilerplate is an open source project maintained by Éverton Toffanetto. ...

## Purpose and features
...
## Source code and documentation
...
```

The response also carried the other eight security headers and a `set-cookie`
line, cut here, and `...` marks shortened text. The Markdown response gets
`script-src 'none'` in its policy, and `vary` lists `Accept`, so a cache keeps
the HTML and the Markdown of the same URL apart.

```text
$ curl -s http://127.0.0.1:4419/llms.txt
# SolidJS Boilerplate

> A foundation for web applications with SolidJS, TypeScript and Vite+, with server-side rendering and light and dark themes.
...
## When to use
## Pages
- [About SolidJS Boilerplate](https://boilerplate-solidjs.devinsights.dev/en/about.md): ...
## Optional
- [Full Markdown of the static pages](https://boilerplate-solidjs.devinsights.dev/llms-full.txt): ...
```

This excerpt keeps the title, the summary, the section headings and one link
from two sections. The absolute URLs come from `VITE_SITE_URL` in the versioned
[`.env`](.env), which the SEO preset requires; set it to the origin of your
deployment. To repeat the run, start the production preview as in
[Running it](#running-it) and send the same requests to its port.

Three Playwright areas check this behavior. In CI,
[SeoIndexes](src/tests/pages/SeoIndexes) reads `llms.txt` from the `e2e` build
and expects the summary, the language note and a Markdown link for the home,
about, contact and privacy pages, and [Markdown](src/tests/pages/Markdown)
checks the negotiation on a fixture page.
[AgentReadiness](src/tests/pages/AgentReadiness) negotiates HTML and Markdown on
the four real pages in each locale and checks the static `.md` files, `llms.txt`
and `llms-full.txt` of the production build. CI does not run it
([limits](#limits)).

## Running it

Install the global [Vite+](https://viteplus.dev/guide/) CLI and Bun. Install
dependencies with `vp install`. Install Chromium once for the browser tests:

```bash
vp run test:browser:install
vp run dev
vp run check:ci
vp run test
vp run test:e2e
```

`vp run dev` serves the app at `http://127.0.0.1:3000/`, from the `HOST` and
`PORT` of the versioned `.env`. The root redirects to a locale, such as `/en`.
Use the language button for `/pt` or `/es`, and the theme button for light, dark
or system. The development server does not send the CSP. To check the production
build with its security headers:

```bash
vp run build
HOST=127.0.0.1 PORT=3000 NODE_ENV=production vp run start
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/security-headers-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="../../docs/assets/readme/security-headers-light.webp" />
  <img src="../../docs/assets/readme/security-headers-light.webp" alt="curl -sI on the boilerplate app's production preview: eight security headers and a CSP whose script-src carries a nonce." width="800" />
</picture>

`curl -sI http://127.0.0.1:3000/en` then shows the security headers and a CSP
nonce that changes on every request. `/en/about.md`, or `/en/about` with
`Accept: text/markdown`, returns the page as Markdown, as in
[See it work](#see-it-work). The [scripts table](docs/development.md#scripts)
lists every command.

## What each page and feature shows

The app has five pages and its SEO routes. The `e2e` build adds the fixture
routes of `src/tests/fixtures/e2e/routes/` and uses a fixture middleware entry;
`vite.config.ts` passes both in its `e2e` option, which the preset applies only
to that build. The `/ui-kit` route and the server error scenarios live there.
The Tests column names the Playwright areas, folders of `src/tests/pages/`, that
cover each part. "(production)" marks cases that run only in the production
suite, which CI does not run; "(partly production)" marks an area with cases in
both suites.

| Part              | What the app shows                                                                                                                                                    | Tests                                                                                                                                                                                                               | Guide                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Pages             | Home, about, contact, privacy and a 404, a top bar, language and theme switchers, `LocalizedLink`, `seo.ts` metadata and an error page                                | [Home](src/tests/pages/Home) (partly production), [NotFound](src/tests/pages/NotFound)                                                                                                                              | [Architecture](docs/architecture.md)                                    |
| Server rendering  | Pages rendered on the server, then hydrated: raw HTML, disabled JavaScript, a held or aborted bundle, reload, click replay and navigation                             | [Hydration](src/tests/pages/Hydration)                                                                                                                                                                              | [Tests](docs/testing.md)                                                |
| Three languages   | Portuguese, English and Spanish from colocated catalogs, English as the base locale, the locale in the URL and redirects that keep it                                 | [I18n](src/tests/pages/I18n) (partly production)                                                                                                                                                                    | [I18n](docs/i18n.md)                                                    |
| Theme             | Light, dark or system, applied before hydration and kept in sync across tabs, with tokens from `light-dark()`                                                         | [Home](src/tests/pages/Home): the `theme`, `themeCss` and `themeStorage` files                                                                                                                                      | [UI](docs/ui.md)                                                        |
| Security headers  | Eight headers from the runtime defaults, three of them also on static files, and a nonce CSP in production that holds for scripts and styles streamed after the shell | [Home](src/tests/pages/Home): the `csp` file (production); [LateRedirect](src/tests/pages/LateRedirect), [FragmentCss](src/tests/pages/FragmentCss)                                                                 | [Security](docs/security.md)                                            |
| Server errors     | Fresh public errors in production, one HTTP exit (`requestJson`) and wrapped SDK adapters                                                                             | [BackendError](src/tests/pages/BackendError), [OutsideError](src/tests/pages/OutsideError)                                                                                                                          | [Server errors](docs/server-errors.md)                                  |
| SEO and Markdown  | `robots.txt`, `sitemap.xml`, partitioned `sitemaps/`, `llms.txt`, escaped JSON-LD and a Markdown copy of each opted-in page                                           | [SeoIndexes](src/tests/pages/SeoIndexes) (partly production), [Markdown](src/tests/pages/Markdown), [StructuredData](src/tests/pages/StructuredData), [AgentReadiness](src/tests/pages/AgentReadiness) (production) | [SEO](docs/seo.md)                                                      |
| Outdated pages    | A tab from the previous build moves to the new one and reloads only where nothing is lost                                                                             | [OutdatedPage](src/tests/pages/OutdatedPage)                                                                                                                                                                        | [Recovery](docs/server-errors/recovery.md#outdated-page-after-a-deploy) |
| Env, icons, fonts | Validated `env.ts`, icons from `hugeicons` and the app's own SVG folder as Solid components, and two Inter subsets with matching preloads                             | [BuildOutput](src/tests/pages/BuildOutput): the `fonts` file (production)                                                                                                                                           | [UI](docs/ui.md#fonts)                                                  |
| Test components   | `Button`, `Input`, `Textarea`, `Dialog`, the toasts and `DropdownMenu`, on the `/ui-kit` route of the `e2e` build                                                     | [UiKit](src/tests/pages/UiKit)                                                                                                                                                                                      | [UI](docs/ui.md)                                                        |

### The same page in three languages

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/app-locales-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="../../docs/assets/readme/app-locales-light.webp" />
  <img src="../../docs/assets/readme/app-locales-light.webp" alt="The boilerplate app's home page at /pt, /en and /es, with the navigation, the title and the language button in each locale." width="800" />
</picture>

Every page lives under `/pt`, `/en` or `/es`, with `lang`, the navigation and
the metadata in that language. Messages sit next to the component that uses
them, in `i18n/{pt,en,es}.json`. `vp run i18n:generate`, which `check:ci`,
`lint` and the test scripts call first, fails on a missing translation, a
duplicate ID or a parameter that differs between locales.

### Components of the test app

`Button`, `Input`, `Textarea`, `Dialog`, the toasts and `DropdownMenu` are part
of this test app. They exist so the tests can exercise the packages in a real
interface, and no package publishes them. Their guide is [UI](docs/ui.md). The
`/ui-kit` route is an E2E fixture that only exists in the `e2e` build
(`src/tests/fixtures/e2e/routes/(base)/ui-kit/`), covered by the
[UiKit](src/tests/pages/UiKit) area. Their styles read the tokens of
`src/theme/tokens/`: 36 colors, 11 fonts, 7 shadows, 6 grids, 5 radii and 3
z-index values, counted as the custom properties declared in each file.

### Outdated pages after a deploy

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/outdated-page-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="../../docs/assets/readme/outdated-page-light.webp" />
  <img src="../../docs/assets/readme/outdated-page-light.webp" alt="A tab from the previous build marks the page as outdated and loads a fresh document on the next navigation." width="800" />
</picture>

`installOutdatedPageDetection` marks the page when a chunk of the previous build
is gone or a server function answers 404 or 409 with
`X-Server-Function-Unknown`. `createOutdatedPageGuard` turns the next path
change into a document navigation, unless the page registered unsaved changes. A
refused submission shows `OutdatedPageNotice` instead of reloading by itself. At
the root, `ErrorFallback` gives way to a single reload; if the failure comes
back within 30 seconds, the error page appears with a manual reload
([recovery guide](docs/server-errors/recovery.md#outdated-page-after-a-deploy)).

## How it is tested

The CI run of the 0.10.0 release pull request
([run 44206537981](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981))
executed these suites:

- Vitest: 185 tests passed in 32 files
  ([Boilerplate app job](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981/job/134474053995)).
  The `node` project ran 68 tests in 12 files, `dom` ran 87 in 13 files in
  happy-dom, and `browser` ran 30 in 7 files in Chromium. Coverage reached
  93.38% of statements, 91.86% of branches, 91.72% of functions and 95.83% of
  lines. The preset sets thresholds of 80% for lines, functions and statements
  and 75% for branches.
- Playwright: the 164 cases of the `e2e` build passed on 2 workers in 1.0 minute
  ([Boilerplate app E2E job](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981/job/134474053917)).

Two suites stay out of CI: the production suite and `PublicationLoad`.
`playwright test --list` counts 155 cases in 12 files for the production build,
next to the 164 in 26 files of the `e2e` build that CI runs: 319 cases in 15
areas. Those counts were enumerated on 2026-11-17 over `4d2c326`, without
running the cases. The production suite covers the CSP of the production entry,
the static Markdown files, the build output and the indexes of the real route
tree. Run it locally with `vp run test:e2e:production`.

`PublicationLoad`, 6 cases in 1 file, stays outside the 319 and outside CI.
`TEST_PUBLICATION_LOAD=true vp run test:e2e` runs it alone against two servers
of the same build. It fills the publication slots on purpose, checks that normal
HTML still answers and that the second server takes the work the first one
refuses, so it never shares a run with the other suites. See
[publication load](docs/testing.md#publication-load).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/readme/e2e-coverage-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="../../docs/assets/readme/e2e-coverage-light.webp" />
  <img src="../../docs/assets/readme/e2e-coverage-light.webp" alt="The boilerplate app's Playwright cases by area, split between the E2E build that CI runs and the production build." width="800" />
</picture>

The upstream CI runs the app's check, Node type check, dead code, Vitest with
coverage, tooling tests and the `e2e` suite on every pull request that changes
the app, a package, a fixture or the root configuration
([CI coverage](../../docs/development.md#ci)). The
[reference](#playwright-cases-by-area) lists the cases by area.

## Limits

- CI runs 164 of the 319 enumerated Playwright cases. The 155 production cases
  and the 6 `PublicationLoad` cases run only when you start them locally
  ([how it is tested](#how-it-is-tested)).
- The app's pages, data and traffic are small. Its tests check behavior and do
  not prove production capacity. The thresholds of `PublicationLoad` are a local
  starting point and set no production SLO
  ([publication load](docs/testing.md#publication-load)).
- The installer determines whether the Markdown converter patch is applied.
- The interactive controls need JavaScript. The tests check the server-rendered
  HTML without JavaScript, and the app makes no promise to work without it.

## Reference

### How it uses the packages

It takes its lint preset, lint rules, formatter settings, TypeScript configs,
Vitest projects, Playwright config, Knip and Stylelint configs and the Vite and
Nitro config (`defineSolidApp`) from `@evertondgn/solid-tooling`. See the
[configuration comparison](../../packages/solid-tooling/README.md#the-configuration-you-stop-maintaining)
of the tooling README for the line counts by area.

The package supplies tools that the application does not import itself. Its
`playwright`, `knip` and `tsrs` tasks resolve executables from the tooling
package. The inherited tsconfig reads package-owned type references, so no
application declaration of `@types/node` or of a TypeScript compiler is needed.
`defineSolidApp` loads the icons plugin, so the app does not declare it; it
declares only the `hugeicons` collection it imports.

`env.ts` spreads the runtime package's `serverEnv` validators for `HOST`, `PORT`
and `BASE_URL_TEST`. The SEO preset validates the application's `VITE_SITE_URL`
origin; it keeps its direct Valibot dependency. `ImportMetaEnv` declares only
the application-owned `PUBLICATION_BUILD_ID`. The runtime is in `dependencies`;
the tooling remains in `devDependencies`, including with Knip's strict
production check. See
[environment and preview](docs/development.md#environment-and-preview).

Middleware, security headers, server errors, the theme, locale navigation, SEO,
sitemaps, Markdown and `llms.txt` come from runtime factories. The application
keeps thin bindings in `src/`: its header values, its public messages, its page
metadata and its content sources. The packages do not cover the `@mdream/js`
patch ([limits](#limits)).

### Updating the packages

Run `vp update -L @evertondgn/solid-tooling @evertondgn/solid-runtime`, then
align SolidJS with the exact peer versions of the installed packages.

### Development scripts

The development scripts include `vp run dev:phone`, to open the app on a phone
in the same network, `vp run test:shuffle`, to find tests that depend on their
order, and `vp run detect:duplicates`. In `vp run dev`, the first server HTML of
a page already carries its route styles, so the page does not appear unstyled
while its JavaScript loads
([styles on the first load](docs/development.md#styles-on-the-first-load-in-development)).
The [scripts table](docs/development.md#scripts) lists every command.

### Playwright cases by area

`playwright test --list` gives these counts without running the cases, on
2026-11-17 over `4d2c326`. CI runs the column of the `e2e` build.

| Area           | E2E build | Production build | Total |
| -------------- | --------: | ---------------: | ----: |
| AgentReadiness |         0 |               77 |    77 |
| I18n           |        18 |               22 |    40 |
| Home           |        28 |                8 |    36 |
| SeoIndexes     |         3 |               26 |    29 |
| Markdown       |        27 |                0 |    27 |
| BackendError   |        25 |                0 |    25 |
| BuildOutput    |         0 |               22 |    22 |
| OutsideError   |        18 |                0 |    18 |
| Hydration      |        18 |                0 |    18 |
| UiKit          |         8 |                0 |     8 |
| OutdatedPage   |         7 |                0 |     7 |
| StructuredData |         6 |                0 |     6 |
| FragmentCss    |         2 |                0 |     2 |
| LateRedirect   |         2 |                0 |     2 |
| NotFound       |         2 |                0 |     2 |

A sixteenth area, `PublicationLoad`, stays out of both columns, as
[How it is tested](#how-it-is-tested) explains.

### Guides

The guides describe the application. The release, CI and Vercel deployment
examples describe the upstream workflows.

| Guide                                                           | What you will find                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Architecture and conventions](docs/architecture.md)            | Routes, component layers, modules and the import rules between layers |
| [Development and delivery](docs/development.md)                 | Prerequisites, environment, build, preview and every script           |
| [Internationalization](docs/i18n.md)                            | Locales, catalogs, localized links, navigation and redirects          |
| [Security headers and CSP](docs/security.md)                    | Header values, the nonce, static files and known limits               |
| [SEO and site indexes](docs/seo.md)                             | Page metadata, `seo.ts` modules, robots and structured data           |
| [Sitemap and content sources](docs/seo/sitemap.md)              | Array and partitioned sources, alternates and the sitemap index       |
| [Markdown and reading by agents](docs/seo/markdown.md)          | Markdown copies, negotiation and the `@mdream/js` patch               |
| [Editorial indexes, endpoints and cache](docs/seo/indexes.md)   | `llms.txt`, `llms-full.txt` and cache headers                         |
| [Publication artifacts and capacity](docs/seo/publication.md)   | Static artifacts, the shared controller and its limits                |
| [Server errors and backend calls](docs/server-errors.md)        | The public error contract and where each guide fits                   |
| [Backend calls](docs/server-errors/backend.md)                  | `requestJson`, SDK adapters and their use in pages                    |
| [Server failure logging](docs/server-errors/logging.md)         | The `[server-error]` line and what it filters                         |
| [Error validation and recovery](docs/server-errors/recovery.md) | Validation, recovery and the outdated page after a deploy             |
| [SSR integrity](docs/server-errors/ssr-integrity.md)            | Render integrity before publishing converted HTML                     |
| [Solid upgrades](docs/server-errors/solid-upgrades.md)          | What to check in the error contracts when Solid changes               |
| [Components, theme and styles](docs/ui.md)                      | Test app components, the theme, tokens, CSS rules, icons and fonts    |
| [Tests](docs/testing.md)                                        | Vitest projects, E2E suites, production checks and reports            |

`AGENTS.md`, the guides in `docs/`, the code comments and the test titles are in
English. The tests check the interface in its three languages.
