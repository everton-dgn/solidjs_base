# 0021. Minimal applications test installed packages with both Bun linkers

- Status: Accepted, amended by [0024](0024-runtime-theme.md),
  [0025](0025-packaged-i18n-generator.md),
  [0026](0026-runtime-locale-navigation.md),
  [0027](0027-packaged-tool-dependencies.md),
  [0028](0028-runtime-server-errors.md),
  [0029](0029-runtime-middleware-chain.md),
  [0030](0030-packaged-environment-schemas.md) and
  [0031](0031-runtime-seo-core.md)
- Date: 2026-11-13

## Context

The lint consumer and the runtime tarball checks do not build an application
outside the workspace. Workspace links can hide missing files or dependencies.
Before moving peers into package dependencies, we need a measured baseline of
what minimal consumers must install.

## Decision

Keep three applications under `fixtures/apps`, outside the workspace:

| Scenario      | Contract                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `client-only` | `ssr: false`, no translation project, static HTML and JavaScript, no Nitro plugin or server output          |
| `ssr-plain`   | SSR without translations, runtime middleware, sitemap sources and security headers                          |
| `ssr-i18n`    | SSR with generated Paraglide runtime, base `fr`, locales `fr/de/it/ja`, publication rules for those locales |

Each runs with Bun's `hoisted` and `isolated` linkers. The node:test executor
packs both packages for every case, copies the fixture into an owned temporary
folder and injects the tarball paths. It runs lint over authored files,
TypeScript, the node and dom Vitest projects and the build. The dom assertion
uses `/` or `/fr` without overriding the preset default. An audit plugin records
resolved plugin names and bundled module IDs to check disabled features. SSR
preview is bound to loopback on a free port and checked for HTML and headers.

`test:scenarios` runs last in root `validate`, keeping the existing CI command.
It stays separate from rule tests and tarball lint tests. Commands have a
60-second deadline, HTTP requests one second, preview startup 15 seconds and
commands share a 150-second case budget; the test runner allows 180 seconds
including cleanup. Child process groups are terminated on command timeouts and
preview is stopped in `finally`, before temporary files are removed.

The pilot (SSR i18n, isolated) passed in 15.457 seconds including preview and
cleanup. The first complete sequential matrix passed six cases in 78.907 seconds
on the development machine, with cached dependencies. No scenario or gate was
removed for the three-minute target. The original root validate took 38.984
seconds. The final validate passed in 71.664 seconds, with its six scenarios
taking 48.412 seconds. Registry/cache state, task caches and machine contention
affect these measurements; the difference is not an isolated benchmark.

## Consequences

Playwright E2E remains in `apps/boilerplate`; runtime browser tests also cover
locale history after ADR 0026. This matrix does not prove browser hydration,
layout, desktop packaging, production CDN behavior, Vercel deployment, streaming
integrity or application-scale load. The i18n fixture exercises generated
runtime, translated message catalogs, locale redirects, Content-Language and
cookie persistence. Sitemap checks now exercise installed factories, array and
partitioned sources, GET/HEAD, language alternates and disabled-resource audits
(ADR 0032). They do not execute the application-owned artifact writers or
Markdown prerender jobs. An extra `isolated-without-sitemap` profile reuses SSR
plain with robots and publication enabled. The meta-only profile removes sitemap
too; no fourth fixture is needed.

At adoption, direct dependency counts including the two injected packages were
client-only 18, SSR plain 19 and SSR i18n 21. ADR 0027 reduces these to 7, 7 and
9 by shipping the tools as package dependencies. These counts exclude transitive
packages. The fixtures pin every version, because `catalog:` does not resolve
outside the workspace. A test compares those versions, the overrides and the
engines with the workspace, so an update cannot leave the matrix on the old
versions. No package production source or dependency contract changes in this
decision.

Optional negative probes inject an actual Nitro plugin, an invalid header value
or a wrong dom URL into a temporary copy. Their expected failures establish that
the corresponding assertions observe the regression. They do not run in normal
validate, which must remain green.

## Optional runtime theme

The ssr-i18n fixture configures the runtime theme, renders a script with a nonce
matching CSP, and checks no explicit class without a cookie and dark class plus
dark theme-color with the cookie. The other scenarios reject runtime theme
modules in all bundle audits. Select `ssr-plain / isolated$` with
`SCENARIO_MUTATION=theme-import`, or `ssr-i18n / isolated$` with `theme-nonce`
or `theme-color`, to prove the assertions fail.

The boilerplate configures theme once in `src/constants/theme.ts`. Its theme
adapters, types and primitive tests moved to the runtime package, which now runs
node and happy-dom projects. UI and CSS remain in the copy. See
[ADR 0024](0024-runtime-theme.md).

## Runtime navigation and tags

ADR 0026 adds DOM navigation to client-only through createLocalizedNavigate,
plus localeTag and the single-language setLocale contract. The extra client-only
isolated-language case uses zh-Hant-TW, bringing the matrix to eight installed
application cases and the version-alignment test. SSR i18n checks regional tags
fr-FR and de-DE in the HTML through localeTag overrides. The copy keeps its
pt-BR/en-US/es-ES values.

Select `client-only / isolated$` with `SCENARIO_MUTATION=navigation-provider` to
inject the real generated provider into the new navigation module, or with
`locale-setter` to remove the single-language setLocale export. Select
`ssr-i18n / isolated$` with `locale-tag` to change the expected HTML tag. These
probes must fail at the bundle audit, provider contract or HTML smoke,
respectively. They mutate only the temporary installation. The generated
provider comes from the runtime test project. Browser navigation and hydration
remain the responsibility of runtime browser tests and the copy's E2E suites.

## Server error protection

Both SSR fixtures register the runtime server-error setup. The preview smoke
checks an error with private message, cause and property markers, requiring the
public message and no marker in the complete response. It drains stdout and
stderr after closing preview, requires `[server-error]`, and rejects private
markers. The i18n fixture checks German and an Italian callback that throws,
which must fall back to the fixed English message without another diagnostic.

Node and preview consumers verify public error identity and render observation
through package subpaths. After a successful smoke, a used server-only import is
planted in the client entry and the build must fail with the Solid boundary
diagnostic. This happens for both linkers, without changing dependencies.

The `error-body` and `error-log` mutations are optional negative probes on
`ssr-plain / isolated$`. Each changes only the runtime installed in the
temporary application and must fail at the corresponding marker assertion.
Existing scenario assertions remain in place. The runner explicitly removes
inherited NODE_ENV and verifies each owned PID and process group before stopping
it. See [ADR 0028](0028-runtime-server-errors.md) for the public API and its
limits.

## Middleware chain and entry helpers

Both SSR fixtures now use the runtime middleware factory and shared entry
helpers. The request-middleware seam selects the localized step only when a
translation project exists; the existing absence-of-provider assertions remain
unchanged. Client-only exercises entry preparation without i18n in its DOM
tests.

The smoke adds failures before rendering on the server-function endpoint and
after rendering a page, plus a thrown bodyless redirect. It checks status,
public text, security headers, CSP, locale headers and no locale cookie without
i18n. The preview must log the filtered middleware source; the existing full-log
private-marker rejection remains. Optional `middleware-body` and
`middleware-headers` mutations must fail their corresponding smoke assertions.
The matrix still has eight installation cases and one alignment test, with the
same budgets and cleanup. Browser hydration and streamed CSS remain covered by
the copy's E2E gates.

## Packaged environment schemas

SSR plain adds `env.ts` with the package fragment and application server/client
keys, read by an `extra` step of the middleware factory, without adding Valibot
to its dependencies. The other fixtures retain the no-schema contract. Both
linkers check exact generated types and a runtime server value different from
the build value. Plain Node loads the runtime env export without the `solid`
condition. The bundle audit requires `solid-runtime/src/env/index.js` in a
server graph, refuses it and Valibot in the client, and rejects every tooling
module without exception. A clean build generates the declarations before lint
and TypeScript; an instrumented build later checks the graph.

Each SSR plain case requires a boot validation error naming `PORT` when preview
receives `PORT=abc`. Nitro preview opens its listener before loading the server,
so the test makes a request and requires HTTP 500 plus the boot diagnostic. A
separate client import of `virtual:solid-env/server` must fail the build. The
existing runtime server-only probe still runs after restoring that entry. See
[ADR 0030](0030-packaged-environment-schemas.md).

## Runtime SEO

ADR 0031 adds metadata, JSON-LD and robots to SSR plain in both linkers. A
single `isolated-meta-only` profile retains meta and JSON-LD with an explicit
site URL, no origin variable and no robots. There are now nine installation
cases plus version alignment, which also checks all runtime production
dependencies. Client-only retains zero SEO modules; an optional `seo-import`
mutation must fail its bundle audit. The regular SSR plain cases reject invalid
origin schemes and paths when SEO is enabled; the meta-only case accepts those
unused values. No new fixture or publication contract is added. The same
deadlines and cleanup rules apply; full browser security remains an application
E2E responsibility.
