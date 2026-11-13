# 0011. Test configs ship in the tooling package

- Status: Accepted
- Date: 2026-11-13

## Context

An application built from boilerplate_solidjs carried its own Vitest projects,
Playwright config, test stand-ins, browser setup, server log teardown and the
`types` and `include` of its `tsconfig.json`. They are the same in every
application, and the Playwright config alone had 173 lines.

A test application outside the workspace, with the packages installed by
tarball, tried each piece from a package before the move:

| Question                                                      | Result                                                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Vitest projects, setup file and stand-ins from the package    | 1,055 tests passed in the node, dom and browser projects                                                    |
| Playwright config from the package, paths from a `root`       | The listing matched the original in the normal, production and publication load modes                       |
| `paths` and `include` with `${configDir}` in a package config | TypeScript 7.0.2, type-aware lint and Vite resolve them; Playwright's loader does not expand `${configDir}` |
| Test stand-ins as `resolve.alias` to files in the package     | Knip applies the aliases to production code and reports the package as an unlisted dependency               |

## Decision

- `./vitest` exports `solidTest({ root, plugins })`, the whole `test` block. A
  Vite plugin serves `server-only`, `virtual:file-routes` and
  `virtual:solid-server-function-handler` to the node project, instead of
  aliases to files.
- `./playwright` exports
  `definePlaywrightConfig({ root, testDir, fixtureServers, suites })`. Paths
  resolve from `root`. The serial suites and the fixture servers of
  boilerplate_solidjs are options, so an application without them gets one
  chromium project.
- `./tsconfig.app.json` adds `types` and an `include` with `${configDir}` to the
  base. The application keeps its `paths`, because Playwright would not resolve
  them from the package.
- `tsconfig.base.json` does not change: an application that only lints, such as
  `fixtures/consumer`, does not have the packages that the new `types` name.
- `@playwright/test` is an optional peer dependency, used only by
  `./playwright`.

## Consequences

- The boilerplate copy lost `tooling/playwright.ts`, the test stand-ins, the
  browser setup and the teardown, with their 8 tests, which moved to the
  package. Its `vite.config.ts` went from 440 to 334 lines.
- The application lists `server-only` in the `ignoreDependencies` of Knip. The
  original resolved it through the test alias.
- The tarball test checks that every export of the installed package exists, so
  a file left out of `files` fails before a release.
- The presets expect the boilerplate layout: test suffixes, page tests in
  `src/tests/pages/`, Paraglide output in `paraglide/` and `.env.test` at the
  root.
