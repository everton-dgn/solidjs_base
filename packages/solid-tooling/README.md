# @evertondgn/solid-tooling

Lint preset, formatter config, TypeScript configs, test configs, the Knip and
Stylelint configs, the Vite+ application config, the commitlint config and the
Git hooks for SolidJS 2 applications built with
[Vite+](https://viteplus.dev/guide/).

The package contains the lint, format, TypeScript, test, build, dead code, CSS
lint, commit message and Git hook setup of
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs), a
SolidJS application template. Applications created from it install the package
instead of copying the files, so a rule change reaches them through a version
update.

## Requirements

The application installs two packages next to this one:

| Package      | Why                                                      |
| ------------ | -------------------------------------------------------- |
| `vite-plus`  | Runs lint and format, and provides the Oxlint plugin API |
| `typescript` | The preset turns on type-aware linting and type checking |

`vite-plus` is a peer dependency, pinned to the exact version the package is
tested with. Install the version listed in its `peerDependencies`. `typescript`
is not a peer dependency: the package is tested with the version in its
`devDependencies`.

An application with translations also installs `@inlang/paraglide-js`, an
optional peer dependency pinned the same way. The lint preset then registers its
plugin.

`eslint-plugin-solid`, `stylelint` and `stylelint-use-nesting` come with the
package, so the application does not declare them.

Some entries need tools the application already runs:

| Entry            | The application installs                                                        |
| ---------------- | ------------------------------------------------------------------------------- |
| `./vitest`       | `@vitest/browser-playwright`, `@vitest/coverage-v8`, `happy-dom`, `playwright`  |
| `./playwright`   | `@playwright/test`, an optional peer dependency pinned like the others          |
| `./knip`         | `knip` and `filesystem-routing`, optional peer dependencies pinned the same way |
| `./commitlint`   | `@commitlint/cli`, an optional peer dependency pinned the same way              |
| `./lefthook.yml` | `lefthook`, an optional peer dependency pinned the same way                     |

`./vite` also needs the test tools of `./vitest`, and loads four plugin
packages: `@solidjs/vite-plugin`, `nitro`, `filesystem-routing` and
`unplugin-icons`. They are optional peer dependencies pinned like the others.
Install the versions listed in `peerDependencies` as direct dependencies of the
application: Bun applies `overrides` and `patchedDependencies` only from the
root `package.json`, and the Knip plugin of `unplugin-icons` only turns on with
a direct dependency.

## Install

`vp` is the Vite+ CLI. An application built with Vite+ already has `vite-plus`
and `typescript`, so it only adds this package:

```bash
vp add -D @evertondgn/solid-tooling
```

An application with translations and without `@inlang/paraglide-js` adds it too,
in the version the package asks for:

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

`defineSolidApp` from `./vite` already calls `solidTest`. An application that
builds its own Vite config calls it directly:

```ts
// vite.config.ts
import { solidTest } from '@evertondgn/solid-tooling/vitest'
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: solidTest({
    root: import.meta.dirname,
    plugins: () => [solid({ serverFunctions: true })]
  })
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

## Application config

`defineSolidApp` returns the whole `vite.config.ts` of a boilerplate
application: the Solid, routing, icons and Nitro plugins, the headers of the
static files, the build, CSS, server and preview blocks, the `vp run` tasks, and
`lint`, `fmt` and `test` from the presets above.

Each feature is turned on only when the application uses it, so nothing it does
not use reaches its build:

- `ssr: false` builds a client-only application, such as an Electron renderer or
  a static site: no Nitro, no server functions and no server bundle.
- The rules for the published files (sitemap, `robots.txt`, `llms.txt` and the
  Markdown pages) need `publication: true`.
- Without `project.inlang/settings.json`, there is no `i18n-generate` task, no
  Paraglide setup in the browser tests and no locale folder in the rules. The
  lint preset registers the Paraglide plugin and its rule only where
  `@inlang/paraglide-js` resolves.

```ts
// vite.config.ts
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

import { SECURITY_HEADERS } from './src/middleware/securityHeaders/constants.ts'

export default defineSolidApp({
  root: import.meta.dirname,
  middleware: './src/middleware/index.ts',
  securityHeaders: SECURITY_HEADERS,
  staticPaths: ['/favicon/**']
})
```

| Option            | Default                 | Use                                                                                                                              |
| ----------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `root`            | required                | Application folder. `.env`, `.env.test`, `project.inlang/settings.json` and the icon folders resolve from it                     |
| `ssr`             | `true`                  | `false` for a client-only application, which takes only `root`, `icons`, `e2e.routes`, `extend`, `tasks` and `workspace`         |
| `securityHeaders` | required with SSR       | Values of `strict-transport-security`, `x-content-type-options` and `cross-origin-resource-policy` for the static files          |
| `publication`     | `false`                 | `true` when the application publishes the sitemap, `robots.txt`, `llms.txt` or Markdown pages, so their files get the headers    |
| `middleware`      | none                    | `start.middleware` of the Solid plugin. It has to sit inside the application folder                                              |
| `serverSetup`     | `serverFunctions: true` | `serverFunctions.serverSetup` of the Solid plugin                                                                                |
| `e2e`             | production paths        | `{ middleware, routes }` for `--mode e2e`: the middleware chain and the route folder of the fixtures, without route types        |
| `icons`           | none                    | Own `unplugin-icons` collections, as name to folder                                                                              |
| `publicAssets`    | none                    | `publicAssets` of Nitro. Each entry needs a `baseURL`, which also gets the static headers                                        |
| `staticPaths`     | none                    | Other static paths that get the headers, such as `/favicon/**`                                                                   |
| `routeRules`      | none                    | More Nitro route rules, applied after the static ones. A rule with the same path replaces the static one                         |
| `extend`          | none                    | `(context) => ({ plugins, nitroModules })`, for plugins and Nitro modules the application still owns                             |
| `tasks`           | none                    | Adds or replaces `vp run` tasks by name                                                                                          |
| `workspace`       | none                    | `{ dependsOn, inputs }` for an application inside a monorepo, whose `bun.lock`, `bunfig.toml` and package builds sit at the root |

The preset fixes the rest:

- Plugins, in this order: the `extend` plugins, `unplugin-icons` (Solid
  compiler, `aria-hidden` on every icon), `@solidjs/vite-plugin` with SSR and
  server functions, `filesystem-routing` with HTTP methods and the route types
  in `src/@types/routes.d.ts`, and Nitro with the `vercel` preset. The `dom` and
  `browser` test projects get the `extend` plugins, the icons, Solid with server
  functions only and the routes. The `test` mode loads no application plugin and
  reads `.env.test` into `process.env`.
- The static headers go to `/assets/**`, each `publicAssets` folder and the
  `staticPaths`. With `publication`, also to `/<locale>/**.md` for each locale
  of `project.inlang/settings.json`, `/llms.txt`, `/llms-full.txt`,
  `/sitemap.xml`, `/sitemaps/pages/**` and `/_markdown/static.json`. The static
  files leave the CDN without going through the middleware, so these rules give
  them the headers the middleware writes on the other responses.
- With `ssr: false`, the plugins are the `extend` plugins, the icons, the Solid
  plugin with `ssr: false` and the routes; the test projects load Solid without
  server functions. The build writes `dist/` with the page and its assets.
- `build.manifest` only in the `e2e` mode, which the `TEST_PREBUILT` check of
  `./playwright` relies on, and no comments in the output.
- Lightning CSS, with CSS Modules classes named `[content-hash]_[local]`.
- `resolve.tsconfigPaths`, and the dev server and the preview on the `HOST` and
  `PORT` of `.env`. The dev server forwards the browser console to the terminal.

The plugins are imported inside `lazyPlugins`, so `vp lint`, `vp fmt` and
`vp check` read the config without loading them.

Nitro compiles the route rules with the `preMerge` of h3, which refuses rules
that overlap in part, such as `/pt/blog/**` next to `/pt/**.md`, and falls back
to its simple mode, with the same result and a warning. `defineSolidApp` throws
when a `publicAssets` entry has no `baseURL`, or one with a trailing slash, when
a static path does not start with `/`, and when a client-only application sets
an option that needs SSR. With `publication`, build, dev and preview fail to
load the plugins when a `publicAssets` folder or a static path sits inside a
locale folder.

### `extend`

`extend` runs inside `lazyPlugins`: once for the application in build, dev and
preview (`target: 'app'`), and once for each test project with a Vite server
(`target: 'test'`). Every load of the config calls it again, so a build also
calls it for the two test projects, whose plugins Vite does not use; keep side
effects out of it. It never runs while Vite+ only reads the config. Return new
plugin instances on each call. The `plugins` go before the fixed ones, and the
`nitroModules` go to Nitro; the `test` target ignores them. One call returns
both, so a value that a plugin and a module share, such as a build id, stays the
same.

```ts
export default defineSolidApp({
  root: import.meta.dirname,
  securityHeaders: SECURITY_HEADERS,
  async extend() {
    const { i18nPlugin } = await import('./tooling/i18n/i18nPlugin/index.ts')
    return { plugins: [i18nPlugin()] }
  }
})
```

### Tasks

| Task                | Command                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `i18n-generate`     | `bun tooling/i18n/generate.ts`, only with `project.inlang/settings.json`                                |
| `lint-css`          | `bun tooling/css/check.ts`                                                                              |
| `dead-code-project` | `knip-bun --config tooling/knip.ts`, then again with `--strict`                                         |
| `lint-project`      | `vp lint`, after `lint-css`                                                                             |
| `check-project`     | `vp fmt --check && vp lint`, after `lint-css`                                                           |
| `typecheck-node`    | `tsc --project tsconfig.node.json`                                                                      |
| `test-tooling`      | `node --test` over `tooling/**/__tests__` except `tooling/release/`, three workers on CI, with no cache |

The commands run the scripts of the boilerplate layout. An application without
one of them replaces the task through `tasks`. Knip reads task commands only
from a `run.tasks` block written in `vite.config.ts`, so it does not see these:
list the scripts they run as Knip entries.

With `workspace`, the cache inputs read `bun.lock`, `bunfig.toml` and the
`inputs` from the workspace root, and `lint-css`, `dead-code-project` and
`typecheck-node` depend on the tasks in `dependsOn`:

```ts
workspace: {
  dependsOn: ['@evertondgn/solid-tooling#build'],
  inputs: ['packages/solid-tooling/dist/**']
}
```

### Changing the result

Wrap the result in `defineConfig` and merge what the application needs. Vite+
removes the plugins it injected before it injects them again, so they are not
duplicated:

```ts
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'
import { defineConfig, mergeConfig } from 'vite-plus'

const app = defineSolidApp({ root: import.meta.dirname, securityHeaders })

export default defineConfig(env =>
  mergeConfig(app(env), { server: { strictPort: true } })
)
```

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
  plugin when `vite.config.ts` imports it with `import()`, as `./vite` does. An
  application that imports `solid()` statically, with `start`, passes
  `solidPluginImport: 'static'`: Knip's Solid plugin then finds the first four
  itself, and listing them again would be a configuration hint.
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
| `solidPluginImport`  | `'lazy'`          | `'static'` when `vite.config.ts` imports `solid()` statically  |
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

## Commit messages and Git hooks

`./commitlint` is the commitlint config: the Conventional Commits rules of
`@commitlint/config-conventional`, with the header limited to 100 characters, a
blank line required before the footer, and a warning for body and footer lines
over 100 characters. The application installs `@commitlint/cli` and points its
config to the package:

```json
// .commitlintrc
{ "extends": ["@evertondgn/solid-tooling/commitlint"] }
```

`./lefthook.yml` holds the Git hooks. The application installs `lefthook`,
allows its install script and extends the file from its own `.lefthook.yml`:

```json
// package.json
{ "trustedDependencies": ["lefthook"] }
```

```yaml
# .lefthook.yml
extends:
  - node_modules/@evertondgn/solid-tooling/lefthook.yml
```

| Hook         | Jobs                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit-msg` | `commitlint` on the message                                                                                                                                    |
| `pre-commit` | `check:fix` on the staged files, which are staged again after the fix, and `scan:secrets --staged` when `kingfisher` is installed. Skipped in merge and rebase |
| `pre-push`   | `check:ci`, `typecheck:node` and `test:ci` in order, then `test:tooling` and `dead-code` together. The first failure stops the rest                            |

The jobs call `package.json` scripts by name, so the application defines
`check:fix`, `scan:secrets`, `check:ci`, `typecheck:node`, `test:ci`,
`test:tooling` and `dead-code`.

Lefthook applies the files in `extends` over `.lefthook.yml`, so:

- A job added in `.lefthook.yml` runs before the shared jobs of the same hook.
- A job declared there with the name of a shared job does not change it.
- To change or skip a shared job, declare a job with the same name in
  `lefthook-local.yml`, which Lefthook applies last, also inside a group. The
  rest keeps its order, and new jobs in that file run after the shared ones.
  Commit the file to change the job for everyone, or keep it out of Git to
  change it on one machine.

Create `.lefthook.yml` before the first install. Without it, the install script
of Lefthook writes a `lefthook.yml` of its own, which Lefthook reads first.

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
- JavaScript plugins: `solid`, `vite-plus` and the three plugins of this package
  (`project`, `backend`, `architecture`), plus `paraglide` when
  `@inlang/paraglide-js` resolves from the folder where lint runs.
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
| `./vite`                 | `defineSolidApp(options)`, the whole `vite.config.ts` of an application   |
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
| `./commitlint`           | The commitlint config                                                     |
| `./lefthook.yml`         | The Git hooks, extended from the application's `.lefthook.yml`            |

An application imports `./vite`, which brings `./lint`, `./fmt` and `./vitest`
along, `./playwright`, `./knip`, `./stylelint` and one of the TypeScript
configs, and extends `./commitlint` and `./lefthook.yml`. An application that
only lints imports `./lint` and `./fmt`. The plugin entries exist because Oxlint
loads plugins by specifier, from the application; the setup and teardown entries
are loaded by the test presets.

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
- `./vite` expects the same layout: its tasks run scripts in `tooling/`, and the
  Markdown rules need the locale prefix of the Paraglide `urlPatterns` in every
  URL. Nitro always uses the `vercel` preset. The plugin packages are pinned, so
  a new version of Solid, Nitro, the router or the icons plugin needs a package
  version tested with it.

## Versions

The package follows semantic versioning. Below 1.0.0, a breaking change raises
the minor version. Each release is listed in the
[changelog](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/CHANGELOG.md).

## License

MIT
