# Application config

[Tooling reference](README.md)

`defineSolidApp` returns the whole `vite.config.ts` of a boilerplate
application: the Solid, routing, icons and Nitro plugins, the headers of the
static files, the build, CSS, server and preview blocks, the `vp run` tasks, and
`lint`, `fmt` and `test` from the [lint](lint.md),
[format](typescript-and-format.md#formatter) and [test](testing.md) presets.

Each feature is turned on only when the application uses it, so nothing it does
not use reaches its build:

- `ssr: false` builds a client-only application, such as an Electron renderer or
  a static site: no Nitro, no server functions and no server bundle.
- The rules for the published files (sitemap, `robots.txt`, `llms.txt` and the
  Markdown pages) need `publication: true`.
- `project.inlang/settings.json` enables the packaged catalog validator and
  Paraglide plugin in dev, build and the `dom` and `browser` test projects. Keep
  catalogs at `src/**/i18n/<locale>.json` and the compiler options in
  `project.inlang/paraglide.config.ts`; no application generator or plugin is
  needed. Locales and the base locale come from the settings, with no fixed set.
- Without `project.inlang/settings.json`, there is no i18n plugin or
  `i18n-generate` task, no Paraglide setup in the browser tests and no locale
  folder in the rules. The lint preset registers the Paraglide plugin and its
  rule only where `@inlang/paraglide-js` resolves.

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

| Option            | Default                 | Use                                                                                                                                                        |
| ----------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `language`        | `en`                    | Single locale when no translation project exists; ignored when generated locale settings exist                                                             |
| `root`            | required                | Application folder. `.env`, `.env.test`, `project.inlang/settings.json` and the icon folders resolve from it                                               |
| `i18nPlugin`      | auto                    | Set `false` to disable only the automatic catalog and Paraglide plugins; locale providers, test setup and the generation task remain enabled by settings   |
| `ssr`             | `true`                  | `false` for a client-only application, which takes only `root`, `language`, `i18nPlugin`, `icons`, `e2e.routes`, `extend`, `tasks`, `workspace` and `test` |
| `securityHeaders` | required with SSR       | Values of `strict-transport-security`, `x-content-type-options` and `cross-origin-resource-policy` for the static files                                    |
| `publication`     | `false`                 | `true` when the application publishes the sitemap, `robots.txt`, `llms.txt` or Markdown pages, so their files get the headers                              |
| `middleware`      | none                    | `start.middleware` of the Solid plugin. It has to sit inside the application folder                                                                        |
| `serverSetup`     | `serverFunctions: true` | `serverFunctions.serverSetup` of the Solid plugin                                                                                                          |
| `e2e`             | production paths        | `{ middleware, routes }` for `--mode e2e`: the middleware chain and the route folder of the fixtures, without route types                                  |
| `icons`           | none                    | Own `unplugin-icons` collections, as name to folder                                                                                                        |
| `publicAssets`    | none                    | `publicAssets` of Nitro. Each entry needs a `baseURL`, which also gets the static headers                                                                  |
| `staticPaths`     | none                    | Other static paths that get the headers, such as `/favicon/**`                                                                                             |
| `routeRules`      | none                    | More Nitro route rules, applied after the static ones. A rule with the same path replaces the static one                                                   |
| `extend`          | none                    | `(context) => ({ plugins, nitroModules })`, for plugins and Nitro modules the application still owns                                                       |
| `tasks`           | none                    | Adds or replaces `vp run` tasks by name                                                                                                                    |
| `workspace`       | none                    | `{ dependsOn, inputs }` for an application inside a monorepo, whose `bun.lock`, `bunfig.toml` and package builds sit at the root                           |
| `test`            | defaults of `solidTest` | `{ domUrl, locale, sourcePackages }` for the test block, described in [Testing](testing.md)                                                                |

The preset serves `virtual:solid-app/locale` in development, builds and all
Vitest projects. With `project.inlang/settings.json`, it re-exports the
application's generated runtime. Otherwise it supplies the single `language`,
returns hrefs unchanged, normalizes absolute URL inputs to URL objects, and
returns undefined when extracting a locale from a URL. The module declarations
are published at `@evertondgn/solid-tooling/virtual-modules` and loaded by
`tsconfig.app.json`.

The preset fixes the rest:

- Plugins, in this order: the locale provider, the `extend` plugins, the catalog
  preparation and Paraglide plugins when i18n is present, `unplugin-icons`
  (Solid compiler, `aria-hidden` on every icon), `@solidjs/vite-plugin` with SSR
  and server functions, `filesystem-routing` with HTTP methods and the route
  types in `src/@types/routes.d.ts`, and Nitro with the `vercel` preset. The
  `dom` and `browser` test projects get the locale provider, `extend` and i18n
  plugins, the icons, Solid with server functions only and the routes. The
  `test` mode loads no application plugin and reads `.env.test` into
  `process.env`.
- The static headers go to `/assets/**`, each `publicAssets` folder and the
  `staticPaths`. With `publication`, also to `/<locale>/**.md` for each locale
  of `project.inlang/settings.json`, `/llms.txt`, `/llms-full.txt`,
  `/sitemap.xml`, `/sitemaps/pages/**` and `/_markdown/static.json`. The static
  files leave the CDN without going through the middleware, so these rules give
  them the headers the middleware writes on the other responses.
- With `ssr: false`, the plugins are the locale provider, the `extend` plugins,
  the optional i18n plugins, the icons, the Solid plugin with `ssr: false` and
  the routes; the test projects load Solid without server functions. The build
  writes `dist/` with the page and its assets.
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

Translations are provided by the preset. Use `extend` only for plugins or
publication modules owned by the application.

To replace the automatic translation plugins, set `i18nPlugin: false` and return
your plugin from `extend`. It receives the same app/test targets and must return
fresh plugin instances. To disable compilation without replacing it, set only
`i18nPlugin: false`; generate the modules before commands that consume them.
This option keeps the locale providers and browser setup because the application
still has a translation project.

The task is independently replaceable by name, like every preset task:

```ts
export default defineSolidApp({
  root: import.meta.dirname,
  securityHeaders: SECURITY_HEADERS,
  i18nPlugin: false,
  tasks: {
    'i18n-generate': { command: 'bun tooling/custom-translations.ts', cache: false }
  },
  async extend() {
    const { customTranslations } = await import('./tooling/custom-translations-plugin.ts')
    return { plugins: [customTranslations()] }
  }
})
```

The two custom files in this example belong to the application. The default
configuration requires neither of them.

### Tasks

| Task                | Command                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `i18n-generate`     | `bun '<package>/dist/i18n-generate.mjs'`, only with `project.inlang/settings.json`                      |
| `lint-css`          | `bun tooling/css/check.ts`                                                                              |
| `dead-code-project` | Package-owned Knip with `--config tooling/knip.ts`, then again with `--strict`                          |
| `lint-project`      | `vp lint`, after `lint-css`                                                                             |
| `check-project`     | `vp fmt --check && vp lint`, after `lint-css`                                                           |
| `typecheck-node`    | Package-owned TypeScript with `--project tsconfig.node.json`                                            |
| `test-tooling`      | `node --test` over `tooling/**/__tests__` except `tooling/release/`, three workers on CI, with no cache |

The uncached `knip`, `tsc`, `playwright`, `lefthook` and `commitlint` tasks
forward their arguments to binaries resolved from the package. For example, use
`vp run playwright test` or `vp run tsc --noEmit`. Knip uses Bun; the other
tools use Node. Without `defineSolidApp`, run
`vp exec node node_modules/@evertondgn/solid-tooling/dist/cli.mjs <tool> <args>`.
The [installation guide](limits.md#packaged-commands-and-types) covers
migration.

The generation entry is compiled and exported as
`@evertondgn/solid-tooling/i18n-generate`. The task resolves its path relative
to the package and runs it from the application root. It validates colocated
catalogs before compiling to `paraglide/`. Its cache covers catalogs, project
settings, compiler options, dependencies and the workspace package build.

The CSS and Knip commands run scripts of the boilerplate layout. An application
without one of them replaces the task through `tasks`. Knip reads task commands
only from a `run.tasks` block written in `vite.config.ts`, so it does not see
these: list the scripts they run as Knip entries.

With `workspace`, the cache inputs read `bun.lock`, `bunfig.toml` and the
`inputs` from the workspace root, and `i18n-generate`, `lint-css`,
`dead-code-project` and `typecheck-node` depend on the tasks in `dependsOn`:

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

## Optional SEO configuration

`seo?: SeoOptions | false` is an SSR option. It accepts only serializable data:
`originEnv?: string` and
`robots?: false | { groups?, sitemapPaths?, cacheControl? }`. Each group has
`userAgents` and optional `allow` and `disallow` string arrays. The plugin
rejects unknown keys, functions and multiline robots directives. `originEnv`
defaults to `VITE_SITE_URL` and is validated when SEO is enabled or the origin
entry is imported. Applications without SEO need no origin.

Use the [runtime SEO API](../../packages/solid-runtime/README.md#optional-seo)
for explicit site values, optional editorial fields, JSON-LD and the robots
factory/route. Its virtual modules export only serialized data. No application
module path is accepted, and `seo` does not enable publication, sitemap or
Markdown generation. Omit the option and origin import for a meta-only profile
with an explicit site URL.

## Optional environment validation

An SSR application can add `env.ts` at its root. The Solid plugin discovers it
in Start mode; omitting it keeps environment validation disabled. A client-only
application does not need an environment file or a site URL. This preset keeps
the plugin's existing client-only behavior, without adding an env option.

Use the package's validators for the variables consumed by the presets:

```ts
// env.ts
import { serverEnv } from '@evertondgn/solid-runtime/env'

const env = { server: { ...serverEnv } }

export default env
```

All three keys are optional. `HOST` accepts a nonempty string. `PORT` accepts
decimal digits and produces an integer from 0 through 65535. `BASE_URL_TEST`
accepts a URL; the Playwright preset additionally requires an explicit port. The
fragment defines schemas, not environment values or defaults.

When adopting the fragment, declare `@evertondgn/solid-runtime` in
`dependencies`: `env.ts` is a production entry in the Knip preset, and the
server bundle imports its schema. Keep `@evertondgn/solid-tooling` in
`devDependencies`. No validator library is added to a fragment-only
application's manifest: the runtime supplies Valibot. The plain JavaScript
export and its declaration load without a `solid` condition, including from
Node.

Extend the maps with the application's own Standard Schema validators:

```ts
import { serverEnv } from '@evertondgn/solid-runtime/env'
import * as v from 'valibot'

const env = {
  server: { ...serverEnv, API_URL: v.pipe(v.string(), v.url()) },
  client: { VITE_API_URL: v.pipe(v.string(), v.url()) }
}

export default env
```

Only an application that imports Valibot itself needs to declare it, as in this
second example. A fragment-only application uses the package dependency, also
with Bun's isolated linker. Validators can come from different Standard Schema
libraries per key. Preserve the preset keys when extending: ordinary object
spread permits replacing a validator, and the package does not intercept that
replacement. Server validators must be synchronous.

Import validated values from `virtual:solid-env/server` in server-only code, or
from `virtual:solid-env/client` for public `VITE_` keys. Client values are
validated and baked at build time without shipping the validator. Server values
are read and validated when the server virtual module loads at boot; invalid
server values warn during build and fail that module's initialization. A schema
file alone does not add boot validation to raw env reads: import the server
virtual module from a server entry or middleware when that check is required.
Nitro preview loads the server on its first request, so an invalid `PORT`
produces HTTP 500 and the per-key boot diagnostic even though the preview
listener has started. Importing the server virtual module into a client graph
fails the build.

The plugin generates `solid-env.d.ts` beside the schema. Run a dev server or
build before checking types in a clean checkout, and keep both files in the
tsconfig `include` (`tsconfig.app.json` already does). Inference crosses the
package boundary, including the optional numeric output of `PORT`. Generated
virtual-module types do not augment `ImportMetaEnv`; applications using
`import.meta.env` keep their own declarations.
