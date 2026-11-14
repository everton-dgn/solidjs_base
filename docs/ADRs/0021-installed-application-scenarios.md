# 0021. Minimal applications test installed packages with both Bun linkers

- Status: Accepted, amended by [0024](0024-packaged-i18n-generator.md)
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
| `ssr-plain`   | SSR without translations or publication, runtime middleware and security headers                            |
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

Browser Vitest and Playwright E2E remain in `apps/boilerplate`. This matrix does
not prove hydration, navigation, layout, desktop packaging, production CDN
behavior, Vercel deployment, streaming integrity or application-scale load. The
i18n fixture exercises generated runtime, translated message catalogs, locale
redirects, Content-Language and cookie persistence. Publication checks cover
emitted rules, not publication jobs. A fourth publication-without-i18n
application is not added: the package unit suite already covers that
combination, and it adds no installation contract.

Dependency counts include the two injected packages: client-only 18, SSR plain
19, SSR i18n 21. These are direct declarations, not transitive package counts.
The fixtures retain currently required test peers even though no browser runs.
The fixtures pin every version, because `catalog:` does not resolve outside the
workspace. A test compares those versions, the overrides and the engines with
the workspace, so an update cannot leave the matrix on the old versions. No
package production source or dependency contract changes in this decision.

Optional negative probes inject an actual Nitro plugin, an invalid header value
or a wrong dom URL into a temporary copy. Their expected failures establish that
the corresponding assertions observe the regression. They do not run in normal
validate, which must remain green.
