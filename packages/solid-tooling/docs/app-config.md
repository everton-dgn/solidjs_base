# Application config

[Tooling reference](README.md)

`defineSolidApp` returns the whole `vite.config.ts` of a boilerplate
application: the Solid, routing, icons and Nitro plugins, the headers of the
static files, the build, CSS, server and preview blocks, the `vp run` tasks, and
`lint`, `fmt` and `test` from the [lint](lint.md),
[format](typescript-and-format.md#formatter) and [test](testing.md) presets.

Each feature is turned on only when the application uses it, so nothing it does
not use reaches its build:

- `ssr: false` builds a client-only application: no Nitro, no server functions
  and no server bundle. It runs with no server, on a static host, in a folder,
  inside another backend or in an app shell such as Electron, Tauri or
  Capacitor; see
  [applications with no server](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/no-server.md).
- Publication uses independent `seo.markdown`, `seo.llms`, `seo.llmsFull` and
  `seo.sitemap` options. Static generation is compiled into the tooling package;
  the application binds runtime factories to its routes and middleware.
- `project.inlang/settings.json` enables the packaged catalog validator and
  Paraglide plugin in dev, build and the `dom` and `browser` test projects. Keep
  catalogs at `src/**/i18n/<locale>.json` and the compiler options in
  `project.inlang/paraglide.config.ts`; no application generator or plugin is
  needed. `defineParaglideConfig(settings.locales)`, from
  `@evertondgn/solid-tooling/paraglide`, returns the profile of the boilerplate
  app: a URL prefix for every locale, the URL, cookie, browser and base locale
  strategy, and the `locale` cookie. Spread it to change one option. Locales and
  the base locale come from the settings, with no fixed set.
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

| Option            | Default                 | Use                                                                                                                                                                                |
| ----------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `language`        | `en`                    | Single locale when no translation project exists; ignored when generated locale settings exist                                                                                     |
| `root`            | required                | Application folder. `.env`, `.env.test`, `project.inlang/settings.json` and the icon folders resolve from it                                                                       |
| `diagnostics`     | auto                    | `diagnostics` of the Solid plugin. Left out, `/__solid/diagnostics` runs in development when the application declares `@solidjs/diagnostics`; `false` turns it off                 |
| `i18nPlugin`      | auto                    | Set `false` to disable only the automatic catalog and Paraglide plugins; locale providers, test setup and the generation task remain enabled by settings                           |
| `ssr`             | `true`                  | `false` for a client-only application, which takes only `root`, `language`, `diagnostics`, `i18nPlugin`, `icons`, `fonts`, `e2e.routes`, `extend`, `tasks`, `workspace` and `test` |
| `securityHeaders` | required with SSR       | Values of `strict-transport-security`, `x-content-type-options` and `cross-origin-resource-policy` for the static files                                                            |
| `seo`             | disabled                | Data-only options for robots, sitemap, Markdown and editorial indexes                                                                                                              |
| `middleware`      | none                    | `start.middleware` of the Solid plugin. It has to sit inside the application folder                                                                                                |
| `serverSetup`     | `serverFunctions: true` | `serverFunctions.serverSetup` of the Solid plugin                                                                                                                                  |
| `e2e`             | production paths        | `{ middleware, routes }` for `--mode e2e`: the middleware chain and the route folder of the fixtures, without route types                                                          |
| `icons`           | none                    | Folder collections of the icons plugin, as name to folder                                                                                                                          |
| `publicAssets`    | none                    | `publicAssets` of Nitro. Each entry needs a `baseURL`, which also gets the static headers                                                                                          |
| `staticPaths`     | none                    | Other static paths that get the headers, such as `/favicon/**`                                                                                                                     |
| `routeRules`      | none                    | More Nitro route rules, applied after the static ones. A rule with the same path replaces the static one                                                                           |
| `extend`          | none                    | `(context) => ({ plugins, nitroModules })`, for plugins and Nitro modules the application still owns                                                                               |
| `tasks`           | none                    | Adds or replaces `vp run` tasks by name                                                                                                                                            |
| `workspace`       | none                    | `{ dependsOn, inputs }` for an application inside a monorepo, whose `bun.lock`, `bunfig.toml` and package builds sit at the root                                                   |
| `test`            | defaults of `solidTest` | `{ domUrl, locale, sourcePackages }` for the test block, described in [Testing](testing.md)                                                                                        |

The preset serves `virtual:solid-app/locale` in development, builds and all
Vitest projects. With `project.inlang/settings.json`, it re-exports the
application's generated runtime. Otherwise it supplies the single `language`,
returns hrefs unchanged, normalizes absolute URL inputs to URL objects, and
returns undefined when extracting a locale from a URL. The module declarations
are published at `@evertondgn/solid-tooling/virtual-modules` and loaded by
`tsconfig.app.json`, like the declarations of the `icon:` imports at
`@evertondgn/solid-tooling/icon-modules`.

The preset fixes the rest:

- Plugins, in this order: the locale provider, the optional font plugin, the
  `extend` plugins, the catalog preparation and Paraglide plugins when i18n is
  present, `@evertondgn/vite-plugin-solid-icons` (`aria-hidden` on every icon,
  installed Iconify collections loaded by their name), `@solidjs/vite-plugin`
  with SSR and server functions, `filesystem-routing` with HTTP methods and the
  route types in `src/@types/routes.d.ts`, and Nitro with the `vercel` preset.
  The `dom` and `browser` test projects get the locale provider, optional fonts,
  `extend` and i18n plugins, the icons, Solid with server functions only and the
  routes. The `test` mode loads no application plugin and reads `.env.test` into
  `process.env`.
- The static headers go to `/assets/**`, each `publicAssets` folder and the
  `staticPaths`. With `seo.markdown.static`, also to `/<locale>/**.md` for each
  locale, or `/**.md` without i18n, and `/_markdown/static.json`. `seo.llms`
  adds `/llms.txt`; `seo.llmsFull` adds `/llms-full.txt`. `seo.sitemap`
  independently adds `/sitemap.xml` and `/sitemaps/pages/**`. The static files
  leave the CDN without going through the middleware, so these rules give them
  the headers the middleware writes on the other responses.
- With `ssr: false`, the plugins are the locale provider, optional fonts, the
  `extend` plugins, the optional i18n plugins, the icons, the Solid plugin with
  `ssr: false` and the routes; the test projects load Solid without server
  functions. The build writes `dist/` with the page and its assets.
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
an option that needs SSR. With `seo.markdown.static`, build, dev and preview
fail to load the plugins when a `publicAssets` folder or a static path sits
inside a locale folder.

### Fonts

The shared `fonts` option is available in SSR and client-only modes. Its
optional plugin follows the locale provider and emits external CSS and font
assets. See [application fonts](fonts.md) for descriptors, `FontLinks`,
client-only HTML injection and migration. Without the option there is no font
plugin or generated font output.

### Icons

The `icons` option maps each folder collection to a folder of SVG files, which
resolves from `root`. The preset loads `@evertondgn/vite-plugin-solid-icons`
with these folders and `aria-hidden="true"` on every icon, and the Iconify
collections that `package.json` installs load by their name. The
[plugin README](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/README.md)
describes the imports, the names and what the build refuses in an SVG file. The
plugin reads the installed collections from the `package.json` of the Vite root,
the folder where Vite runs, and writes the declarations of the names there; it
is `root` when Vite runs in the application folder, as `vp run` does.

#### Migrating from `~icons/`

Up to 0.7.0 the preset loaded `unplugin-icons`. An application that updates from
it:

- Replaces each `~icons/<collection>/<name>` import with
  `icon:<collection>/<name>`. `icon:<collection>` also exports each icon by its
  name, as in `import { Github } from 'icon:hugeicons'`.
- Deletes its declaration of the `~icons/*` modules, such as
  `src/@types/icons.d.ts`. `tsconfig.app.json` loads the declarations of the
  `icon:` imports through `@evertondgn/solid-tooling/app-env`, so a
  `tsconfig.json` with its own `types` keeps that entry. The types of the
  plugin, such as `IconComponent`, come from
  `@evertondgn/vite-plugin-solid-icons/types` without a dependency of the
  application, which the [Knip config](knip-and-css.md) accepts.
- Adds `src/icon-collections.d.ts` to `.gitignore`. The dev server, the build
  and the `icons-generate` task write the names of every collection there, and
  `lint-project` and `check-project` run the task first. Run
  `vp run icons-generate` before a `vp lint` or a `tsrs` outside these tasks
  when the application imports icons by name.
- Keeps only `?raw` in an import, for the SVG markup as a string, written
  without a value: `?raw=true` stops the build too. The old plugin turned the
  other keys of a query into attributes of the `<svg>`, as in `?width=2em`; the
  build now stops on any other query, `?url` included. Pass the attributes as
  props of the component, as in `<IconGithub width="2em" />`, which go on the
  `<svg>` after its own. For the URL of a file of a folder collection, import
  the file with the `?url` of Vite, as in
  `import logoUrl from './assets/icons/logo.svg?url'`, or build a data URL from
  `?raw`.
- Names each collection with lowercase letters, digits and single hyphens, as in
  `my-images`. Another name in `icons` stops the dev server, the build and
  `icons-generate` with the list of the invalid names.
- Spells the name of the file exactly, in its case: `icon:brand/logo-mark` loads
  `logo-mark.svg` only. The old loader also tried `logoMark.svg`, `LogoMark.svg`
  and `logo_mark.svg`; import such a file by its own name, as in
  `icon:brand/LogoMark`.
- Reviews the SVG files of its folders. The build stops on markup that runs code
  or that a page reads as HTML, such as `<script>`, an `onload` attribute, a
  `javascript:` URL or `<foreignObject>`, and on a file that is not well-formed
  XML, where the old loader read the file as it was from its `<svg` on. See
  [what the plugin does with your SVG files](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/README.md#what-the-plugin-does-with-your-svg-files).
- Keeps its folders relative to `root`, as before.
- Installs each Iconify collection as `@iconify-json/<collection>`. An icon of
  the whole `@iconify/json` package still loads by its path, but the
  declarations of the names list only the `@iconify-json/*` packages, and the
  Knip config ignores only them, where the Knip plugin of `unplugin-icons` that
  0.7.0 turned on also ignored `@iconify/json`.
- Declares `unplugin-icons` in its own `package.json` when it imports it, as in
  its own `vite.config.ts`: the tooling no longer installs it.

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

Translations and publication artifacts are provided by the preset. Use `extend`
only for additional plugins or Nitro modules owned by the application. The
publication plugin and module share one build identity without an `extend`
callback.

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

| Task                | Command                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `i18n-generate`     | `bun '<package>/dist/i18n-generate.mjs'`, only with `project.inlang/settings.json`                            |
| `icons-generate`    | `node '<package>/dist/icons-generate.mjs'`, with `root` and `icons` as JSON                                   |
| `lint-css`          | `bun tooling/css/check.ts`                                                                                    |
| `dead-code-project` | Package-owned Knip with `--config tooling/knip.ts`, then again with `--strict`                                |
| `lint-project`      | `vp lint`, after `lint-css` and `icons-generate`                                                              |
| `check-project`     | `vp fmt --check && vp lint`, after `lint-css` and `icons-generate`                                            |
| `typecheck-node`    | Package-owned `tsrs` with `--project tsconfig.node.json`                                                      |
| `test-tooling`      | `node --test` over `tooling/**/__tests__` except `tooling/release/`, three workers on CI, with no cache       |
| `doctor`            | The [installed package diagnostics](#installed-package-diagnostics), with the preset's options, with no cache |
| `agents`            | Writes the pointer block of `AGENTS.md`, or compares it with `--check`, with no cache                         |

The uncached `knip`, `tsrs`, `playwright`, `lefthook` and `commitlint` tasks
forward their arguments to binaries resolved from the package. For example, use
`vp run playwright test` or `vp run tsrs --noEmit`. Knip uses Bun; the other
tools use Node. Without `defineSolidApp`, run
`vp exec node node_modules/@evertondgn/solid-tooling/dist/cli.mjs <tool> <args>`.
The [installation guide](limits.md#packaged-commands-and-types) covers
migration.

The generation entry is compiled and exported as
`@evertondgn/solid-tooling/i18n-generate`. The task resolves its path relative
to the package and runs it from the application root. It validates colocated
catalogs before compiling to `paraglide/`. Its cache covers catalogs, project
settings, compiler options, dependencies and the workspace package build.

`@evertondgn/solid-tooling/icons-generate` writes `src/icon-collections.d.ts`,
the typed names of every collection that the icons plugin also writes in the dev
server and the build, so the type check of `lint-project` and `check-project`
reads the current icons. It fails when a collection that `package.json` lists
cannot be read. Its cache covers the SVG files of the icon folders,
`package.json`, dependencies and the workspace package build. A pattern of the
cache cannot follow a folder outside the application, or one whose path has a
glob character such as `*` or `[`, so with such a folder the task runs every
time instead of restoring older declarations. The lint and format presets and
Knip leave the file out; keep it out of Git too, as the boilerplate does.

The CSS and Knip commands run scripts of the boilerplate layout. An application
without one of them replaces the task through `tasks`. Knip reads task commands
only from a `run.tasks` block written in `vite.config.ts`, so it does not see
these: list the scripts they run as Knip entries.

With `workspace`, the cache inputs read `bun.lock`, `bunfig.toml` and the
`inputs` from the workspace root, and `i18n-generate`, `icons-generate`,
`lint-css`, `dead-code-project` and `typecheck-node` depend on the tasks in
`dependsOn`:

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
`originEnv?: string`, `sitemap?: boolean | { static: true }`,
`markdown?: false | { static?, maxInputBytes?, maxOutputBytes?, timeoutMs? }`,
`llms?: false | { maxBytes? }`, `llmsFull?: false | { maxBytes? }` and
`robots?: false | { groups?, sitemapPaths?, cacheControl? }`. Each group has
`userAgents` and optional `allow` and `disallow` string arrays. The plugin
rejects unknown keys, functions and multiline robots directives. `originEnv`
defaults to `VITE_SITE_URL` and is validated when SEO is enabled or the origin
entry is imported. Applications without SEO need no origin.

Use the
[runtime SEO API](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-runtime/docs/seo.md)
for explicit site values, optional editorial fields, JSON-LD and the robots
factory/route. Its virtual modules export only serialized data. No application
module path is accepted. `seo.sitemap` controls static header rules; the
application explicitly installs `createSitemapRoutes` handlers and declares
`robots.sitemapPaths`. Disabling the feature removes its route files, source
binding and array metadata, and omits both the flag and robot announcements. The
option does not install application route files. `sitemap: { static: true }`
adds the compiled artifact pipeline; `sitemap: true` retains header rules for
direct runtime services. Markdown static generation requires
`markdown: { static: true }`. `llmsFull` requires both `llms` and static
Markdown and rejects incompatible configurations before building. Omitted or
false features emit no corresponding artifacts or rules. Remove disabled route
bindings and document announcements from the application too. Importing a
disabled runtime factory fails the build. The removed `publication` option is
rejected with a migration diagnostic. See
[ADR 0034](https://github.com/everton-dgn/solidjs_base/blob/main/docs/ADRs/0034-runtime-markdown-publication.md)
for examples and budgets. Omit SEO and the origin import for meta-only use with
an explicit site URL.

### Publication artifacts

The build writes files for crawlers, for what you turn on: a `.md` copy of each
opted-in page with `markdown: { static: true }`, `llms.txt` with `llms`,
`llms-full.txt` with `llmsFull`, and the sitemap XML with
`sitemap: { static: true }`. A bad artifact fails the build before it reaches
production: a `.md` file that is empty, not UTF-8 or still an HTML document, an
index or sitemap file over its byte budget, an `llms.txt` whose link to
`llms-full.txt` disagrees with the files built, a static page that resolves to
another route, or a Markdown list or sitemap inventory from a different build
than the SSR bundle. Your config needs no `extend` callback for this.

`@evertondgn/solid-tooling/publication/read-llms-index` exports
`readLlmsIndex(text)`, the compiled reader of the generated `llms.txt`, for
artifact checks in Node. It returns the title, the description and the links of
the index, and it throws when the title is missing.

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

## Installed package diagnostics

Run `vp run doctor` in the application before changing code. It prints five
sections:

- the application folder and, when it differs, the installation root, whose
  `package.json` holds the `overrides` that align versions;
- the Solid Base and Solid packages installed, with their versions;
- a summary of the checks, with how many passed, warned and failed, followed by
  each warning and error with the expected and observed values, the fix and the
  file to edit;
- the skills to read, relative to the application folder when they are inside
  it;
- the `vp run` commands that validate a change.

Errors exit with status 1; warnings do not. Color and status symbols appear only
when stdout is a terminal and `NO_COLOR` is not set. Add `--json` for the same
report as one object, with absolute paths and every check, the passed ones
included. Vite+ prints the task command before its output. For a JSON-only
stdout stream, or when the config cannot load, use
`node --input-type=module -e "import '@evertondgn/solid-tooling/cli'" -- solid-tooling doctor --root . --json`.

Run `vp run agents` to install the pointer in AGENTS.md. Use
`vp run agents --check` to verify it without writing. Applications using
CLAUDE.md can include `@AGENTS.md` there. The command writes the block right
after the Vite+ block, or at the top of the file. It refuses to write, naming
the file and both lines, when a block marker sits below any line with three
backticks or tildes, so it never edits a code example: keep the managed blocks
above every code fence.
