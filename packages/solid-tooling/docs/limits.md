# Requirements, limits and versions

[Tooling reference](README.md)

## Requirements

The tooling, the runtime and the icons plugin declare in `engines.node` the
lowest Node version they are tested with, so an older release of the same major
line does not qualify. The boilerplate app and the fixture apps also cap their
range below the next major line. Check `engines.node` in each package and
application manifest.

The package installs the tools it uses at the versions it tests. Applications
keep direct dependencies for imports in their own source and for Vite+:

| Application dependency                        | Why it stays                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `solid-js`, `@solidjs/web`, `@solidjs/router` | Application imports and a shared Solid runtime instance                                 |
| `vite-plus` and `vite`                        | Local Vite+ CLI and its Vite alias; keep the root `vite` and `vitest` overrides         |
| `@inlang/paraglide-js`                        | With translations, generated code imports its runtime                                   |
| `@inlang/plugin-message-format`               | With translations, Inlang settings name its file under the application's `node_modules` |
| Application libraries                         | Keep every direct import, including types and test helpers                              |

`vite-plus` is an exact peer dependency. `@inlang/paraglide-js` remains an exact
optional peer; install the versions in the tooling manifest. Bun reads
`overrides` and patches from the application root, including when the affected
package is transitive.

The tooling package supplies `@solidjs/vite-plugin`, `nitro`,
`filesystem-routing`, `@evertondgn/vite-plugin-solid-icons`, `knip`, `tsrs` for
type checking, `@types/node`, `happy-dom`, `playwright`, `@playwright/test`,
`@vitest/browser-playwright`, `@vitest/coverage-v8`, `@vitest/ui`,
`@testing-library/jest-dom`, `@commitlint/cli` and `lefthook`. It also supplies
its existing lint, CSS and catalog dependencies. Updating the tooling package
updates these tools, including for applications that do not use every feature.
Installation cost is measured in
[ADR 0027](https://github.com/everton-dgn/solidjs_base/blob/main/docs/ADRs/0027-packaged-tool-dependencies.md).

A library used directly still belongs in the application's manifest. The
boilerplate app keeps `filesystem-routing` for API helpers and tests, and
`@playwright/test` for its E2E imports. Keep those versions aligned with the
package to avoid duplicate instances. The app also keeps `valibot` and
`schema-dts`. The runtime owns `@mdream/js`; compiled publication tooling uses
its own Nitro dependency. The runtime exports `StartMiddleware` from
`./middleware/types`, so a middleware needs no direct Solid plugin dependency
just for that type.

## Install

Install the package next to the application's Vite+ and Solid dependencies:

```bash
vp add -D @evertondgn/solid-tooling
```

Applications with translations install Paraglide at the peer version and keep
the message-format plugin declared. Other applications do not need either.

Before installing with Bun, set `"trustedDependencies": []` in the root manifest
when hook installation should be explicit. Bun's default trusted list runs
Lefthook's postinstall even when Lefthook is transitive. Create the hook config
first, then run `vp run lefthook install` when using `defineSolidApp`. See
[Git hooks](commits-and-hooks.md) for applications using only the lint preset.

## Packaged commands and types

`defineSolidApp` registers uncached `knip`, `tsrs`, `playwright`, `lefthook` and
`commitlint` tasks. They resolve the binary from the tooling package and forward
arguments from the application root:

```bash
vp run tsrs --noEmit
vp run knip --config tooling/knip.ts --strict
vp run playwright test
vp run commitlint --edit COMMIT_EDITMSG
```

Without the application preset, use the published command entry:

```bash
vp exec node node_modules/@evertondgn/solid-tooling/dist/cli.mjs lefthook install
```

Do not assume a transitive binary appears in the application's
`node_modules/.bin`. Knip runs in Bun; the other commands run in Node.
`tsconfig.app.json` includes `node-env.d.ts` through `files` and loads the
published `@evertondgn/solid-tooling/app-env` entry through `types`. Both
resolve references beside the package's dependencies. `app-env` loads
`@evertondgn/solid-tooling/icon-modules`, which declares the `icon:` imports and
the `@evertondgn/vite-plugin-solid-icons/types` entry that
`src/icon-collections.d.ts` imports, with every type of the installed plugin. An
application types its icons and imports those types without declaring the
plugin, also when its install cannot reach a dependency of a dependency, as with
Bun's isolated linker. This keeps application and browser matcher declarations
in their original order. Node-only derived configs use `types: []` instead of
reintroducing `types: ["node"]`. An application that overrides `files` must also
include `node_modules/@evertondgn/solid-tooling/node-env.d.ts`.

## Known limits

- An application with no server (`ssr: false` on a static host, in a folder, in
  another backend or in an app shell) needs the hash history of the router under
  `file://`. Translations by URL prefix need a server, and the document
  navigation of `createLocalizedNavigate` and `createLocaleNavigationGuard`
  leaves a folder base and fails under `file://`. The installed scenario opens
  the build in Chromium with `--allow-file-access-from-files`, which approaches
  a shell such as Electron and does not replace a test in one.
  `storage: 'local-storage'` is accepted with SSR, but the server cannot read
  the choice, so the page shows the default theme until `createTheme` applies
  it; the cookie is the storage for SSR. See
  [applications with no server](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/no-server.md#limits).
- `@evertondgn/solid-runtime/env` exports optional preset validators, with
  Valibot supplied by the runtime package. Valibot requires no application
  declaration unless the application imports Valibot itself. The isolated
  installed scenario verifies this boundary. `VITE_SITE_URL` remains
  application-owned. See
  [environment validation](app-config.md#optional-environment-validation).
- Applications adopting the fragment declare the runtime in `dependencies`,
  because Knip checks `env.ts` as a production entry. The tooling stays in
  `devDependencies`; the fragment does not pull its development tools into a
  production-only installation. Every tooling module remains forbidden in the
  application bundle audit.
- Environment validation is opt-in through the SSR application's `env.ts`. The
  fragment does not change direct `process.env` or `import.meta.env` reads.
  Generated virtual types do not replace `ImportMetaEnv`. Object spread can
  override preset keys, so preserving their validators is the application's
  responsibility. Importing the server virtual module bundles the fragment and
  Valibot on the server; env validation adds neither to the client. Application
  imports of validators have their own bundle cost. Build-only tooling remains
  excluded.
- The package ships compiled JavaScript. Node refuses to run TypeScript from
  `node_modules`, and Vite+ loads `vite.config.ts` in Node.
- `project/test-filename` has no options. Test folders without a module, such as
  the page tests in `src/tests/pages/`, are listed inside the package with the
  names used in boilerplate_solidjs. For any other folder of that kind, turn the
  rule off in `lint.overrides`, as shown in
  [Changing the preset](lint.md#changing-the-preset).
- Some rule messages point to `docs/architecture.md` and `AGENTS.md`. Those
  files belong to the application created from boilerplate_solidjs.
- The test presets expect the boilerplate layout: tests named by suffix
  (`.node.test`, `.dom.test`, `.browser.test`, `.e2e.test`), page tests in
  `src/tests/pages/`, Paraglide output in `paraglide/` and `.env.test` at the
  root. With Paraglide, the `dom` project starts at `/<baseLocale>`, which fits
  `urlPatterns` that prefix every locale; `domUrl` sets another URL.
- The Knip and CSS configs expect the same layout: pages in `src/routes/`,
  fixture routes in `src/tests/fixtures/` and the theme in `src/theme/`.
- The Knip config ignores every unlisted dependency in its own file, not only
  this package.
- With packaged test tools, Knip ignores `happy-dom`, `@vitest/coverage-v8` and
  `@testing-library/jest-dom`, which its Vitest plugin attributes to the
  application config. Set `packagedTestTools: false` when defining your own test
  config with those dependencies. Direct imports still require declarations.
- The i18n generator reads `src/**/i18n/<locale>.json`, excluding `src/tests/`
  and `__tests__/`. Every catalog folder must have all configured locales, with
  identical global IDs and compatible parameters. IDs use an owner prefix such
  as `home_title`; duplicate IDs, missing translations and invalid messages fail
  with the source file or directory and key. The sum of catalog sizes is limited
  to 8 MiB by `CATALOGS_MAX_BYTES` in the package. Raising it requires measuring
  build memory: each preparation reads every catalog and Paraglide loads all
  locales. No incremental or per-request generation is provided.
- `./vite` expects the same layout: its CSS and Knip tasks run scripts in
  `tooling/`. With i18n, Markdown rules need the locale prefix of the Paraglide
  `urlPatterns` in every URL; without i18n, the preset uses `/**.md`. Nitro
  always uses the `vercel` preset. The plugin packages are pinned, so a new
  version of Solid, Nitro, the router or the icons plugin needs a package
  version tested with it.
- `tsrs` ports the TypeScript 7.1 beta and is the only compiler the package
  ships: it has no `--init` and no `--showConfig`, and its `--watch` does not
  run on Windows. pnpm with `trustPolicy: no-downgrade` rejects it until
  `trustPolicyExclude` lists it, which `vp migrate` writes. The type check of
  the lint reports only the files the lint reads; `vp run tsrs --noEmit` also
  checks ignored and generated files and the diagnostics without a file.

## Versions

The package follows semantic versioning. Below 1.0.0, a breaking change raises
the minor version. Each release is listed in the
[changelog](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/CHANGELOG.md).

## License

MIT
