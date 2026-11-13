# 0018. The runtime package starts with the middleware steps

- Status: Accepted
- Date: 2026-11-13

## Context

[ADR 0003](0003-runtime-package-as-source.md) chose TypeScript source with the
`solid` export condition for the runtime package. It left open how that source
works with `virtual:file-routes`, with Vitest and with the Node process that
loads `vite.config.ts`.

A copy of the boilerplate outside the workspace, with a prototype of the package
installed by tarball, moved the middleware steps to the package and measured:

| Question                                                   | Result                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| The steps in the package, the chain in the application     | Every suite of the copy passed; 931 Vitest tests in the copy and 124 in the package add up to the 1,055 of the baseline      |
| `vite.config.ts` importing the header constants as `.ts`   | Node refused them (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`); with only the `solid` condition, the config loader failed |
| The same constants as `.js` with a `.d.ts`                 | Node loaded them                                                                                                             |
| `solid` in the conditions of the whole Vitest node project | The tests that use `@solidjs/router` broke: the router resolved to its `.jsx` source                                         |
| The package installed and not imported                     | No module of the package in the client, SSR or Nitro output                                                                  |
| One module imported                                        | That module and the ones it imports reached the SSR output, and nothing reached the client                                   |
| A barrel entry without `sideEffects`                       | The top-level `createAPIHandler(routes)` and `createAPIMatcher(routes)` calls stayed in the server output, unused            |
| `"sideEffects": false` with a one-line client entry        | The build passed, the entry came out empty and the page did not hydrate                                                      |

## Decision

- `packages/solid-runtime` (`@evertondgn/solid-runtime`) ships TypeScript
  source, compiled by the application's Vite. It is private, at version `0.0.0`,
  and stays out of release-please until its first manual publish.
- Each module has its own export, with only the `solid` condition pointing to
  the `.ts` file. There is no barrel and no `.` export.
- `sideEffects` is a list, never `false`. It is empty today; a module with an
  intended effect, such as a client entry, goes into it.
- The security header constants ship as `constants.js` with `constants.d.ts`,
  under the `types` and `default` conditions, because the application's
  `vite.config.ts` imports them through Node. The extraction plan sent them to
  the tooling package instead; the runtime cannot depend on a package that the
  application installs as a development dependency.
- The first slice holds `securityHeaders` with its constants,
  `restrictPageMethods`, `requestClassification`, `negotiatePageFormat`,
  `isHtmlResponse`, the `Middleware` and `Next` types, and `apiRoutes`, which is
  `createAPIHandler(routes)` over `virtual:file-routes`. The locale and Markdown
  steps, the failure containment and the chain that joins the steps stay in the
  application. The application picks the steps, which keeps translations and
  Markdown optional.
- The package tests run in its own Vitest (`vp test run`), with the stand-ins
  for `server-only` and the virtual modules that `solidTest` serves to an
  application. Its `test` script puts them in `vp run test` and
  `vp run validate` at the root. `nitro` is a development dependency, because a
  regression test loads the `srvx` adapter through it.
- `solidTest` takes a `sourcePackages` option, `['@evertondgn/solid-runtime']`
  by default. A plugin of the node project resolves the subpaths of those
  packages through their `solid` condition, to the real path of the file,
  without adding the condition to the whole project. It looks the package up
  from the application folder upwards, as Node does, and does nothing when the
  package is not installed.
- `tsconfig.app.json` sets `customConditions: ["solid"]`, so TypeScript reads
  the same files.

## Consequences

- The boilerplate copy imports the steps by package specifier and lost the moved
  modules, their tests and `HTTP_METHOD_NOT_ALLOWED`, which only
  `restrictPageMethods` used. Its production build writes the same
  `.vercel/output/config.json` as before, and its client bundle has no module of
  the package.
- Because the empty `sideEffects` list behaves like `false`, the client entry
  has to enter the list when it moves to the package, or the build drops it
  without an error.
- The root lint gives the runtime sources the test exceptions of an
  application's `src/`, not the Node and `node:test` exceptions of the tooling
  sources.
- `node --test` cannot run the package tests: they use the Vitest globals,
  `vi.mock` of virtual modules and `vi.hoisted`.
- The Vitest config of the package repeats the stand-ins of `solidTest`. The
  tooling README does not document the `sourcePackages` option yet.
- Still in the application: the render integrity, `infra/server`, the SSR
  entries, i18n, SEO and the theme.
