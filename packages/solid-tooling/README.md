# @evertondgn/solid-tooling

Lint preset, formatter config, TypeScript configs, test configs and the Knip and
Stylelint configs for SolidJS 2 applications built with
[Vite+](https://viteplus.dev/guide/).

The package contains the lint, format, TypeScript, test, dead code and CSS lint
setup of
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs), a
SolidJS application template. Applications created from it install the package
instead of copying the files, so a rule change reaches them through a version
update.

## Requirements

The application installs three packages next to this one:

| Package                | Why                                                         |
| ---------------------- | ----------------------------------------------------------- |
| `vite-plus`            | Runs lint and format, and provides the Oxlint plugin API    |
| `@inlang/paraglide-js` | The preset registers its lint plugin, resolved from the app |
| `typescript`           | The preset turns on type-aware linting and type checking    |

`vite-plus` and `@inlang/paraglide-js` are peer dependencies, pinned to the
exact versions the package is tested with. Install the versions listed in its
`peerDependencies`. `typescript` is not a peer dependency: the package is tested
with the version in its `devDependencies`.

`eslint-plugin-solid`, `stylelint` and `stylelint-use-nesting` come with the
package, so the application does not declare them.

Some entries need tools the application already runs:

| Entry          | The application installs                                                        |
| -------------- | ------------------------------------------------------------------------------- |
| `./vitest`     | `@vitest/browser-playwright`, `@vitest/coverage-v8`, `happy-dom`, `playwright`  |
| `./playwright` | `@playwright/test`, an optional peer dependency pinned like the others          |
| `./knip`       | `knip` and `filesystem-routing`, optional peer dependencies pinned the same way |

## Install

`vp` is the Vite+ CLI. An application built with Vite+ already has `vite-plus`
and `typescript`, so it only adds this package:

```bash
vp add -D @evertondgn/solid-tooling
```

An application without `@inlang/paraglide-js` adds it too, in the version the
package asks for:

```bash
npm view @evertondgn/solid-tooling peerDependencies
vp add -D @inlang/paraglide-js@<version>
```

## Usage

```ts
// vite.config.ts
import { fmt } from '@evertondgn/solid-tooling/fmt'
import { lint } from '@evertondgn/solid-tooling/lint'
import { defineConfig } from 'vite-plus'

export default defineConfig({ fmt, lint })
```

```json
// tsconfig.json
{
  "extends": "@evertondgn/solid-tooling/tsconfig.base.json",
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "vite.config.ts"]
}
```

`vp check`, `vp lint` and `vp fmt` read both configs from `vite.config.ts`.

## Tests

`solidTest` returns the `test` block of `vite.config.ts`, with three Vitest
projects:

| Project   | Files                            | Environment                                      |
| --------- | -------------------------------- | ------------------------------------------------ |
| `node`    | `src/**/*.node.test.{ts,tsx}`    | Node, with stand-ins for the build-only modules  |
| `dom`     | `src/**/*.dom.test.{ts,tsx}`     | happy-dom at `http://localhost/en`               |
| `browser` | `src/**/*.browser.test.{ts,tsx}` | Chromium through Playwright, with the CSS loaded |

```ts
// vite.config.ts
import { solidTest } from '@evertondgn/solid-tooling/vitest'

export default defineConfig({
  test: solidTest({ root: import.meta.dirname, plugins: componentPlugins })
})
```

`plugins` is a function that returns the Vite plugins the `dom` and `browser`
projects need to compile components: Solid, routes, icons and i18n. The preset
calls it once per project, because each project starts its own Vite server and a
plugin instance keeps the state of one server. The preset also sets the coverage
thresholds, the reporters and the workers on CI, passes `BASE_URL_TEST`, `HOST`
and `PORT` to the tests when they are set, and resets the Paraglide locale
before each browser test.

The `node` project does not load the Solid and routing plugins, so a plugin of
the preset serves `server-only`, `virtual:file-routes` and
`virtual:solid-server-function-handler`. Knip does not know `server-only`, a
virtual module of `@solidjs/vite-plugin`: pass it in the `ignoreDependencies` of
[`defineKnipConfig`](#knip).

`definePlaywrightConfig` builds the Playwright config from the application root:

```ts
// playwright.config.ts
import { definePlaywrightConfig } from '@evertondgn/solid-tooling/playwright'

export default definePlaywrightConfig({ root: import.meta.dirname })
```

It reads `BASE_URL_TEST` from `.env.test`, builds the application (`e2e` mode
for the fixture routes, `production` with `TEST_PRODUCTION_ROUTES=true`), starts
the preview, and checks the server log for private markers when the suite ends.
`TEST_PREBUILT=true` reuses an existing production build.

| Option           | Default           | Use                                                                    |
| ---------------- | ----------------- | ---------------------------------------------------------------------- |
| `testDir`        | `src/tests/pages` | Folder of the `*.e2e.test.ts` files                                    |
| `fixtureServers` | none              | Extra servers for the fixture routes, as `{ command, url }`            |
| `suites`         | none              | Globs of serial suites: `serverLogs`, `markdown` and `publicationLoad` |

Each serial suite gets its own project: `markdown` runs with one worker,
`serverLogs` runs last as the teardown of the others, and `publicationLoad` runs
alone, against two servers, with `TEST_PUBLICATION_LOAD=true`.

## Knip

`defineKnipConfig` returns the Knip config of the application as a function, the
form Knip accepts as the default export of its config file:

```ts
// tooling/knip.ts
import path from 'node:path'

import { defineKnipConfig } from '@evertondgn/solid-tooling/knip'

export default defineKnipConfig({
  root: path.resolve(import.meta.dirname, '..'),
  ignoreDependencies: ['server-only']
})
```

Run it with `knip-bun --config tooling/knip.ts`, then with `--strict`. The
config lists:

- `src/entry-server.tsx`, `src/entry-client.tsx`, `src/middleware/index.ts`,
  `env.ts` and `paraglide/runtime.js` as production entries. The Solid plugin
  and the Paraglide runtime load them by path, and Knip does not read the Solid
  plugin when `vite.config.ts` imports it with `import()`.
- Every page and HTTP handler that `filesystem-routing` finds in `src/routes/`,
  as production entries, and in `src/tests/fixtures/routes/` and
  `src/tests/fixtures/e2e/routes/`, as test entries. The `filesystem-routing`
  plugin of Knip is turned off, because it takes every file of `src/routes/` as
  an entry and would hide unused helpers next to the routes.
- `src/**/*.{ts,tsx}` and `tooling/**/*.ts` as the project, with the tests out
  of the production files.

The config turns on `treatConfigHintsAsErrors`, and Knip reports an entry or a
project pattern without files as a configuration hint. So each default above
enters only when the application has the file or the folder.

| Option               | Default           | Use                                                            |
| -------------------- | ----------------- | -------------------------------------------------------------- |
| `root`               | required          | The application folder                                         |
| `configFile`         | `tooling/knip.ts` | Path of the config file, relative to `root`                    |
| `entry`              | none              | More entries, such as a public API that only test fixtures use |
| `ignoreBinaries`     | none              | Passed to Knip as is                                           |
| `ignoreDependencies` | none              | Passed to Knip as is                                           |
| `ignoreIssues`       | none              | Passed to Knip, merged with the entry for `configFile`         |
| `exclude`            | none              | Issue types to leave out, such as `catalogReferences`          |

Knip adds the file given to `--config` to the entries in production mode, and
`--strict` only accepts `dependencies` there, so it reports this package as an
unlisted dependency of the config file. The config ignores `unlisted` issues in
`configFile` only: an import of this package from `src/` is still reported. An
application that keeps the config somewhere else passes its path in
`configFile`.

Nothing that depends on the application is a default. An ignore that matches
nothing is a configuration hint too, so `server-only` and the binaries of the
scripts are options. For a key without an option, wrap the function:

```ts
const configure = defineKnipConfig({ root })

export default async function configureKnip() {
  return { ...(await configure()), ignoreUnresolved: ['virtual:example'] }
}
```

## CSS lint

`checkCss(root)` lints `src/**/*.css` with Stylelint and the CSS policy of the
boilerplate, and checks the name of every CSS file in `src/` as
`project/css-filename` does for imports: `styles.module.css`, or `camelCase.css`
inside `src/theme/`. It returns the report and whether anything failed:

```ts
// tooling/css/check.ts
import path from 'node:path'
import process from 'node:process'

import { checkCss } from '@evertondgn/solid-tooling/stylelint'

const { report, hasErrors } = await checkCss(
  path.resolve(import.meta.dirname, '../..')
)

process.stdout.write(report)
if (hasErrors) process.exitCode = 1
```

`defineStylelintConfig(root)` returns the Stylelint config that `checkCss` uses.
The policy:

- Classes use snake_case, nesting goes at most two levels deep, and adjacent
  state selectors and media queries are nested (`stylelint-use-nesting`).
- Unknown or invalid properties, values, units, selectors, at-rules and media
  features are errors, as are deprecated and unmatchable selectors.
- Outside `src/theme/`, colors, gradients, radii, shadows, font sizes and
  weights and `z-index` come from tokens with `var()`, from the matching token
  family. Literal colors, color functions and system colors are errors.
- Inside `src/theme/`, the token rules are off, so the theme can define the
  values with `oklch()`, `oklab()`, `color-mix()`, `light-dark()` and system
  colors. Hex, named colors and the `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`
  and `color()` functions are still errors there.
- `var()` and animation names resolve against `src/theme/tokens/**/*.css` and
  `src/theme/class/animation.css`. Stylelint stops the whole run when a
  reference matches no file, so each one is passed only when it exists.
- An exception needs a `stylelint-disable` comment with the reason after `--`.

`stylelint` and `stylelint-use-nesting` are dependencies of this package. The
config passes the plugin by a path resolved from the package, because Stylelint
looks up a plugin name from the application and its working directory, where it
is not installed.

## Project layout the preset expects

The rules match file paths relative to the folder where lint runs, so run it
from the application root. They know these locations:

| Path                                          | Meaning                                                  |
| --------------------------------------------- | -------------------------------------------------------- |
| `src/`                                        | Application code. The `@/` alias points here             |
| `src/routes/`                                 | Pages. Each page may have a `seo.ts` module              |
| `src/components/{atoms,molecules,organisms}/` | UI layers                                                |
| `src/primitives/`                             | Shared primitives                                        |
| `src/infra/server/`                           | Backend adapters and server error handling               |
| `src/theme/`                                  | Global CSS                                               |
| `src/tests/pages/<Page>/`                     | End-to-end tests, one folder per page                    |
| `paraglide/`                                  | Generated i18n modules. The `@paraglide/` alias          |
| `tooling/`                                    | Project scripts and their tests, written for `node:test` |

An application with another layout can still use the preset, but it has to
override the rules that do not fit. See
[Changing the preset](#changing-the-preset).

## What the lint preset turns on

- Oxlint plugins: `import`, `jsx-a11y`, `node`, `oxc`, `promise`, `typescript`,
  `unicorn` and `vitest`.
- JavaScript plugins: `solid`, `paraglide`, `vite-plus` and the three plugins of
  this package (`project`, `backend`, `architecture`).
- Type-aware rules and type checking (`typeAware`, `typeCheck`).
- Warnings fail the run (`denyWarnings`), and an unused disable directive is an
  error.

Every rule is listed by name in the preset. No Oxlint category is enabled, so an
Oxlint update does not add rules on its own.

### Rules of this package

| Rule                                      | What it enforces                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project/css-modules-import`              | A CSS Module is imported as the default binding `S`                                                                                                        |
| `project/css-filename`                    | A CSS file imported from `src/` is named `styles.module.css`, or `camelCase.css` inside `src/theme/`                                                       |
| `project/test-filename`                   | A test file sits in `__tests__` next to its module and is named after it, plus the environment: `Button/__tests__/Button.dom.test.tsx`                     |
| `project/no-export-list`                  | Exports sit on the declaration. `export { a, b }` is only allowed with `from`                                                                              |
| `project/seo-module`                      | A route `seo.ts` exports only `seo`. It has no relative value import, no value import from `src/routes/`, no computed `import()` and no `import.meta.glob` |
| `backend/static-solid-imports`            | No `import()` of `@solidjs/web` or its subpaths                                                                                                            |
| `backend/static-render-integrity-imports` | No `import()` of the `renderIntegrity` module                                                                                                              |
| `architecture/layer-imports`              | Lower layers do not import upper ones, and production code does not import tests or `tooling/`                                                             |

These rules read import specifiers as text. They resolve relative paths and the
`@/`, `@paraglide/` and `/src/` prefixes. An `import()` with a computed path and
any other alias are not checked, except in `seo.ts`, where a computed `import()`
is an error.

`architecture/layer-imports` checks these directions:

- The base layer (`src/@types`, `constants`, `helpers`, `data`, `infra`,
  `theme`, `i18n` and `paraglide/`) does not import primitives, components,
  routes or entry files.
- `src/primitives` does not import components, routes or entry files.
- Atoms do not import molecules or organisms, and molecules do not import
  organisms.
- No production file imports a test or `tooling/`.

The entry files are `App`, `Document`, `entry-server`, `entry-client`, `router`
and `middleware`, at the root of `src/`.

`project/test-filename` accepts these names:

- `Name.<environment>.test.ts(x)` in `src/`, where the environment is `node`,
  `dom`, `browser` or `e2e`.
- `Name.test-d.ts(x)` in `src/`, for type tests.
- `Name.test.ts` in `tooling/`.

`Name` is the folder that holds `__tests__`. A qualifier may follow it:
`Button.focus.dom.test.tsx`. End-to-end tests are the exception: they live in
`src/tests/pages/<Page>/` and are named after the page.

### Backend restrictions

Inside `src/`, the preset also restricts what code can reach:

- `console` is not allowed. `src/infra/server/logServerFailure/index.ts` is the
  only module that may call `console.error`.
- `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` are not allowed.
  `src/infra/server/requestJson/index.ts` is the only module that may call
  `fetch`.
- The Node transports (`http`, `https`, `http2`, `net`, `tls`, `undici`) cannot
  be imported.
- `markSafeError` and `SAFE_ERROR` can only be imported in
  `src/infra/server/publicErrors/index.ts`.
- `configureServerErrors` from `@solidjs/web`, the
  `@solidjs/web/server-functions` subpath and `observeRenderFailures` from the
  application's `renderIntegrity` module can only be imported in
  `src/infra/server/configureServerErrors/index.ts`.
- A relative import goes up at most three levels. Use `@/` beyond that.

Test files and `.d.ts` files are exempt from all of these except the relative
import limit.

## Changing the preset

`lint` and `fmt` are plain objects. Spread them and replace what the application
needs:

```ts
// vite.config.ts
import { fmt } from '@evertondgn/solid-tooling/fmt'
import { lint } from '@evertondgn/solid-tooling/lint'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt,
  lint: {
    ...lint,
    ignorePatterns: [...(lint.ignorePatterns ?? []), 'generated/**'],
    rules: { ...lint.rules, 'eslint/max-params': 'off' }
  }
})
```

Do not replace `lint.jsPlugins`. It registers the JavaScript plugins listed
above, and a rule whose plugin is missing from it fails to resolve.

To turn a rule off for some files only, add an entry to `lint.overrides` and
keep the existing ones:

```ts
overrides: [
  ...(lint.overrides ?? []),
  {
    files: ['src/tests/pages/Checkout/**'],
    rules: { 'project/test-filename': 'off' }
  }
]
```

## Entry points

| Entry                    | Content                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `./lint`                 | `lint`: the lint preset, with the plugins below registered                |
| `./fmt`                  | `fmt`: the formatter config                                               |
| `./tsconfig.base.json`   | Compiler options, without application paths                               |
| `./tsconfig.app.json`    | The base plus the `types` and `include` of the boilerplate layout         |
| `./vitest`               | `solidTest(options)`, the `test` block of `vite.config.ts`                |
| `./playwright`           | `definePlaywrightConfig(options)`, the Playwright config                  |
| `./vitest-setup/browser` | Setup file of the browser project, loaded by `./vitest`                   |
| `./playwright-teardown`  | Server log check, loaded by `./playwright`                                |
| `./project-plugin`       | The `project` rules                                                       |
| `./backend-plugin`       | The `backend` rules                                                       |
| `./architecture-plugin`  | The `architecture` rule                                                   |
| `./solid-plugin`         | Re-export of `eslint-plugin-solid`                                        |
| `./css-filename`         | `cssFilenameError(path)`, the CSS naming check, for a script outside lint |
| `./knip`                 | `defineKnipConfig(options)`, the Knip config                              |
| `./stylelint`            | `checkCss(root)` and `defineStylelintConfig(root)`, the CSS lint          |

An application imports `./lint`, `./fmt`, `./vitest`, `./playwright`, `./knip`,
`./stylelint` and one of the TypeScript configs. The plugin entries exist
because Oxlint loads plugins by specifier, from the application; the setup and
teardown entries are loaded by the test presets.

## Formatter

`fmt` sets 80 columns, single quotes, no semicolons, no trailing commas, wrapped
prose in Markdown and sorted imports. It ignores `public/`, `src/assets/`,
generated route types, SVG and lock files.

## TypeScript base

`tsconfig.base.json` targets ES2024 with bundler resolution, keeps JSX for the
Solid compiler (`jsxImportSource: @solidjs/web`), emits nothing and turns on the
unused code and unchecked index checks. It has no `paths`, `include` or `types`.

`tsconfig.app.json` extends the base with the `types` of a boilerplate
application and an `include` resolved from the application folder with
`${configDir}`, which needs TypeScript 5.5 or later. Each entry of `types` comes
from a package the application installs:

| Entry of `types`                        | Package                     |
| --------------------------------------- | --------------------------- |
| `node`                                  | `@types/node`               |
| `vite/client`                           | `vite`                      |
| `vite-plus/test/globals`                | `vite-plus`                 |
| `@testing-library/jest-dom/vitest`      | `@testing-library/jest-dom` |
| `@solidjs/vite-plugin/boundary-modules` | `@solidjs/vite-plugin`      |
| `@solidjs/vite-plugin/virtual-modules`  | `@solidjs/vite-plugin`      |

The application still declares its `paths`:

```json
{
  "extends": "@evertondgn/solid-tooling/tsconfig.app.json",
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"], "@paraglide/*": ["./paraglide/*"] }
  }
}
```

Playwright reads the `tsconfig.json` of the test files with its own loader,
which does not expand `${configDir}`, so paths declared in the package would
break the `@/` imports of the end-to-end tests.

## Known limits

- The package ships compiled JavaScript. Node refuses to run TypeScript from
  `node_modules`, and Vite+ loads `vite.config.ts` in Node.
- `project/test-filename` has no options. Test folders without a module, such as
  the page tests in `src/tests/pages/`, are listed inside the package with the
  names used in boilerplate_solidjs. For any other folder of that kind, turn the
  rule off in `lint.overrides`, as shown in
  [Changing the preset](#changing-the-preset).
- The Paraglide plugin is always registered, so `@inlang/paraglide-js` has to be
  installed even in an application without translations.
- Some rule messages point to `docs/architecture.md` and `AGENTS.md`. Those
  files belong to the application created from boilerplate_solidjs.
- The test presets expect the boilerplate layout: tests named by suffix
  (`.node.test`, `.dom.test`, `.browser.test`, `.e2e.test`), page tests in
  `src/tests/pages/`, Paraglide output in `paraglide/` and `.env.test` at the
  root.
- The Knip and CSS configs expect the same layout: pages in `src/routes/`,
  fixture routes in `src/tests/fixtures/` and the theme in `src/theme/`.
- The Knip config ignores every unlisted dependency in its own file, not only
  this package.

## Versions

The package follows semantic versioning. Below 1.0.0, a breaking change raises
the minor version. Each release is listed in the
[changelog](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/CHANGELOG.md).

## License

MIT
