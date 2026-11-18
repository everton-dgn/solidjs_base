# Architecture

This repository publishes three npm packages and keeps a copy of the
boilerplate_solidjs app that runs on them. This guide covers what each package
owns, what stays in an application, how the packages depend on each other and
how the copy and the fixture apps test them. Each package README holds its API,
its entry points and its test counts.

## Where code lives

An application built on the packages takes code from four places.

| Place                                 | Content                                                                                                                                                                                                                                                                                                                                                                                                               | Shipped as                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `@evertondgn/solid-tooling`           | `defineSolidApp()`, which returns the whole `vite.config.ts` with its plugins and `vp run` tasks; the lint preset with the `project`, `backend`, `architecture` and `solid` plugins; the formatter preset; the TypeScript, Vitest, Playwright, Knip and Stylelint configs; the translation and icon type generators; the font CSS and the publication artifacts of the build; the commitlint config and the Git hooks | Compiled ES modules with type declarations                                |
| `@evertondgn/solid-runtime`           | Security headers and CSP, the middleware chain, server error protection, locale requests, URLs and navigation, the theme, SEO, robots.txt, sitemaps, Markdown pages and `llms.txt`, environment schemas and font links                                                                                                                                                                                                | TypeScript source, with plain JavaScript for four entries that Node loads |
| `@evertondgn/vite-plugin-solid-icons` | A Vite+ plugin that turns Iconify collections and folders of SVG files into Solid components imported by name, with generated types                                                                                                                                                                                                                                                                                   | Compiled ES modules with type declarations                                |
| The application                       | Pages, UI components, message catalogs, the theme palette, `App`, `Document`, the `entry-*` pair, the middleware file, header values, public error messages, page metadata, content sources, version pins and patches                                                                                                                                                                                                 | Its own repository                                                        |

The packages ship in two forms because they run in two places. The tooling runs
in Node when `vp` loads `vite.config.ts`, and Node refuses TypeScript inside
`node_modules` ([ADR 0002](ADRs/0002-compiled-tooling-package.md)). The runtime
runs inside the application build and is compiled with the application's Solid
version ([ADR 0003](ADRs/0003-runtime-package-as-source.md)). The icons plugin
is loaded by `vite.config.ts` in Node, as the tooling is, and ships compiled the
same way ([ADR 0037](ADRs/0037-icons-vite-plugin-package.md)).

The three packages share one version number. `release-please-config.json` puts
them in one `linked-versions` group, so a release of one raises the others to
the same version ([Releasing](releasing.md)).

## What stays in the application

Some files cannot move to a package:

- `App`, `Document`, the `entry-*` pair and the middleware: the Solid Vite
  plugin looks for them in the application and refuses a path outside the Vite
  root.
- Version pins and patches: Bun reads `overrides` and `patchedDependencies` only
  from the root `package.json` of the project that installs.
- Pages, UI components, message catalogs and the theme palette: they are what
  makes one application different from another.
- The values passed to the runtime factories: header values, public error
  messages, page metadata and content sources. The boilerplate copy keeps these
  bindings in `src/`, as
  [How it uses the packages](../apps/boilerplate/README.md#how-it-uses-the-packages)
  shows.

The [roadmap](../README.md#roadmap) lists the work planned next.

## How the packages depend on each other

The tooling depends on the icons plugin. In the workspace it declares
`workspace:*`, and the published tooling pins the plugin to its own version.
`defineSolidApp` loads the plugin, so an application on the preset does not
declare it.

The tooling and the runtime declare no dependency on each other. An application
installs the tooling as a development dependency and the runtime as a production
one, and the two meet in the application build:

- The TypeScript entries of the runtime need the `solid` export condition. The
  Solid Vite plugin, which the preset loads, adds it to the application build.
  The Vitest `node` project does not load that plugin, so `solidTest` resolves
  the packages of its `sourcePackages` option, the runtime by default, through
  the condition. `tsconfig.app.json` sets it for TypeScript.
- 27 of the 64 runtime entries import `virtual:solid-app/*` modules, which only
  `defineSolidApp` serves. The
  [runtime README](../packages/solid-runtime/README.md#import-only-what-you-use)
  lists them. With a translation project, the preset's
  `virtual:solid-app/request-middleware` module re-exports the locale step from
  `@evertondgn/solid-runtime/middleware/localize-request`. Without one, it
  passes each request on.
- The tooling build bundles the publication protocol of the runtime,
  `packages/solid-runtime/src/infra/server/publication/protocol.js`, which the
  runtime also exports as `./server/publication-protocol`. The artifact writer
  of the build and the reader of the server use the same paths, file names and
  byte limits ([ADR 0033](ADRs/0033-runtime-sitemap-publication.md)).
- The `backend` lint plugin restricts how an application imports two runtime
  entries, `server/configure-server-errors` and `server/render-integrity`.

Each package pins its peer dependencies to the exact versions it is tested with:
`vite-plus` and the optional `@inlang/paraglide-js` for the tooling,
`@solidjs/web` for the runtime, and `vite-plus` and `@solidjs/web` for the icons
plugin. A new version of one of them needs a package version tested with it.
[Update the packages](../README.md#update-the-packages) shows how an application
raises them together.

Applications install the runtime in production. Its manifest lists four
production dependencies, `@mdream/js`, `filesystem-routing`, `schema-dts` and
`valibot`, and keeps build and test tools out of them, as
[AGENTS.md](../AGENTS.md#package-dependencies) requires.

## `@evertondgn/solid-tooling`

`vp pack` builds one file in `dist/` for each entry of `pack.entry` in
`packages/solid-tooling/vite.config.ts`, with its type declarations, and writes
the `exports` map from those entries. The map adds the two TypeScript configs,
the declaration files of the app environment, the virtual modules and the icon
modules, `lefthook.yml` and `package.json`: 27 entry points in all, which the
[package README](../packages/solid-tooling/README.md#entry-points) lists.

The lint preset registers the plugins in `lint.jsPlugins` by package specifier,
such as `@evertondgn/solid-tooling/project-plugin`. Oxlint resolves them from
the application, and with Bun's isolated linker the application only sees its
direct dependencies. That is why `./solid-plugin` re-exports
`eslint-plugin-solid`: the package depends on it, and the application does not
have to declare it. For the same reason, `./stylelint` passes
`stylelint-use-nesting` to Stylelint by a path resolved from the package.

`./vite` builds the whole `vite.config.ts` of an application and loads
`@solidjs/vite-plugin`, `filesystem-routing`,
`@evertondgn/vite-plugin-solid-icons` and `nitro` with `import()` inside
`lazyPlugins`, so lint and format runs never load them. They are package
dependencies pinned to the tested versions. The application keeps its own direct
imports and its root `overrides` and patches, which also apply to transitive
packages. Publication artifacts and the catalog plugin belong to the preset.
Additional application-specific plugins enter through `extend`.
[ADR 0027](ADRs/0027-packaged-tool-dependencies.md) records dependency
ownership. [ADR 0012](ADRs/0012-application-config-preset.md) records the
options and what stays out of them. Each feature is turned on only when the
application uses it: `ssr: false` builds a client-only application without
Nitro, independent `seo` options enable publication artifacts and rules, and the
Paraglide task, test setup and lint plugin follow the presence of Paraglide
([ADR 0016](ADRs/0016-optional-application-features.md)).

The rules read import specifiers and file paths as text, and they expect the
boilerplate layout: `src/` with `components/atoms`, `molecules` and `organisms`,
`helpers`, `infra` and the other layers, and `tooling/` for build and test code.
The [lint guide](../packages/solid-tooling/docs/lint.md) lists each rule and its
limits.

## `@evertondgn/solid-runtime`

The package ships TypeScript source, and the application's Vite compiles it
([ADR 0003](ADRs/0003-runtime-package-as-source.md)). Its 64 entry points are
the keys of `exports` in its manifest, and the
[package README](../packages/solid-runtime/README.md#import-only-what-you-use)
lists them by feature.

- 60 entries have only the `solid` condition, pointing to a `.ts` or `.tsx`
  file. There is no barrel, so a module the application does not import never
  enters its build.
- Four entries are plain JavaScript with a handwritten declaration, under
  `types` and `default`, because Node loads them:
  - `./middleware/security-headers/constants`: the default header values, which
    the application's `vite.config.ts` reads through Node
    ([ADR 0018](ADRs/0018-runtime-package-middleware.md)).
  - `./env`: the optional environment schemas, loaded in Node, Vite's module
    runner and the server bundle. Valibot belongs to the runtime dependencies,
    and the application keeps the tooling in `devDependencies`
    ([ADR 0030](ADRs/0030-packaged-environment-schemas.md)).
  - `./theme/stored-theme-script`: the script that applies a stored theme in an
    application with no server, imported by its `vite.config.ts`
    ([ADR 0036](ADRs/0036-no-server-mode.md)).
  - `./server/publication-protocol`: the publication constants that the tooling
    build shares ([ADR 0033](ADRs/0033-runtime-sitemap-publication.md)).
- The middleware chain is a factory, `createMiddleware`, that takes the
  application's security instance, its extra steps and an optional document step
  ([ADR 0029](ADRs/0029-runtime-middleware-chain.md)). The security step is a
  factory, `createSecurityHeaders`, whose `headers` and `cspDirectives` options
  replace the default values. The application calls it once and every step that
  writes a response uses that instance
  ([ADR 0019](ADRs/0019-runtime-security-headers-options.md)).
- `sideEffects` is an empty list. A module with an intended effect, such as a
  client entry, has to be listed there; `false` would let the build drop that
  module without an error.

The package is built to run under the `defineSolidApp` preset, which serves its
virtual modules and sets up the `solid` condition, as
[How the packages depend on each other](#how-the-packages-depend-on-each-other)
explains.

## `@evertondgn/vite-plugin-solid-icons`

The icons plugin has a package of its own, so a Vite+ application with SolidJS 2
can use it without the preset
([ADR 0037](ADRs/0037-icons-vite-plugin-package.md)).

- It supports only Vite+ and SolidJS 2. It reads the icons of
  `@iconify-json/<collection>` packages with `@iconify/utils` and the SVG
  folders the application declares, and leaves the component to the Solid plugin
  of the application, so the installed Solid compiler writes the DOM and the
  server output.
- Icons are imported through the `icon:` scheme. A transform rewrites each
  import by name into an import of one icon before the build, so the bundle
  carries only the icons the application names.
- The dev server and the build write a declaration file with one module per
  collection and one export per name.
- `vp pack` builds two entries, the plugin and `./types`, which lets the
  declarations of an application import the component type without the types of
  Vite. The `exports` map adds the `./icon-modules` declaration file and
  `package.json`.
- Its production dependencies are `@iconify/utils` and `magic-string`. The
  plugin runs in the build with the Vite+ that the application installs, so
  `vite-plus` and `@solidjs/web` are peers. Its other build tools stay in
  `devDependencies`, and its tarball test checks that.

`defineSolidApp` loads the plugin inside `lazyPlugins` and passes it the `icons`
option. An application without the tooling adds it to its own Vite+ config, as
the [plugin README](../packages/vite-plugin-solid-icons/README.md#install)
shows.

## How the packages are tested

Two kinds of application test the packages. The boilerplate copy in
`apps/boilerplate` declares them as `workspace:*`, so it runs the source of the
same commit with its full suites. The apps in `fixtures/` live outside the
workspace and install the packed tarballs, the way an application installs them
from npm.

| Level                           | What it proves                                                                                                                                                                                                                                                                          | Command                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Tooling tests                   | Each lint rule accepts and rejects the expected code, through `RuleTester` and through the Oxlint CLI, and the presets run against fixtures in temporary folders                                                                                                                        | `vp run test`                                         |
| Runtime tests                   | The runtime entries, in the package's own Vitest with `node`, `dom` and `browser` projects and coverage thresholds                                                                                                                                                                      | `vp run test`                                         |
| Icons plugin tests              | Builds and dev servers of apps in temporary folders, SVG security, hostile names and hydration                                                                                                                                                                                          | `vp run test`                                         |
| Package checks                  | Lint, types and unused code of the runtime, checked in its folder as in an application, and unused code of the icons plugin                                                                                                                                                             | `vp run check`, `vp run dead-code`                    |
| Tarball tests                   | The packed tooling installs in a copy of `fixtures/consumer` and its plugins load. The packed runtime holds every target of `exports` and no tests, and its header constants and stored theme script load in Node. The packed icons plugin installs in a new app that types its imports | `vp run test:tarball`                                 |
| Installed application scenarios | The three apps of `fixtures/apps/` install the three tarballs with both Bun linkers, then test, lint, type check and build. SSR cases request the preview, and a disabled feature must leave no module in the bundle                                                                    | `vp run test:scenarios`                               |
| Boilerplate application         | A complete application passes its check, Node type check, dead code, Vitest, build and end-to-end suites                                                                                                                                                                                | See [Development](development.md#the-boilerplate-app) |

`vp run validate` runs the build, the checks, the dead code check, the package
tests, the tarball tests and the scenarios, in this order. The Packages job of
CI and the publish job run it, and a package change also runs the boilerplate
app jobs ([CI](development.md#ci)). Each README gives its test counts and the CI
run they come from: the
[tooling](../packages/solid-tooling/README.md#how-it-is-tested),
[runtime](../packages/solid-runtime/README.md#how-it-is-tested),
[icons plugin](../packages/vite-plugin-solid-icons/README.md#how-it-is-tested)
and [boilerplate app](../apps/boilerplate/README.md#how-it-is-tested).

The tarball tests exist because a workspace link hides one failure: Node refuses
to run TypeScript from `node_modules`, so a package that only works through the
link breaks once it is installed from npm. The runtime tarball test does not
compile the `.ts` entries: Node cannot run them. The installed application
scenarios compile them from the tarball, while the boilerplate copy compiles
them through the workspace link
([ADR 0020](ADRs/0020-runtime-package-checks-in-its-own-folder.md)). The packed
tooling pins the icons plugin of the same tree, which npm may not have yet, so
the scenarios install the packed plugin in its place through `overrides`
([installed application scenarios](development.md#installed-application-scenarios)).
