# Architecture

## Where code lives

An application built from boilerplate_solidjs takes code from three places.

| Place                       | Content                                                                                                                                                                                                                                                                    | Shipped as                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `@evertondgn/solid-tooling` | Lint preset, the `project`, `backend`, `architecture` and `solid` lint plugins, formatter preset, TypeScript configs, Vitest and Playwright configs, Knip and Stylelint configs, the `defineSolidApp()` preset for Vite and Nitro, the commitlint config and the Git hooks | Compiled JavaScript with type files |
| `@evertondgn/solid-runtime` | Today, the middleware steps: security headers and CSP, API routes, page methods, request classification and page format. Planned: server errors, i18n runtime, theme logic, primitives, SEO, Markdown pages, and the sitemap, robots and llms.txt handlers as factories    | TypeScript source                   |
| The application             | Pages, UI components, message catalogs, the theme palette, `App`, `Document`, the `entry-*` pair, a thin middleware, one-line SEO routes, version pins and patches                                                                                                         | Its own repository                  |

The two packages ship in different forms because of how each one runs. See
[ADR 0002](ADRs/0002-compiled-tooling-package.md) and
[ADR 0003](ADRs/0003-runtime-package-as-source.md).

## What stays in the application

Some files cannot move to a package:

- `App`, `Document`, the `entry-*` pair and the middleware: the Solid Vite
  plugin requires their paths to be inside the Vite root.
- Version pins and patches: Bun reads `overrides` and `patchedDependencies` only
  from the root `package.json` of the project that installs.
- Pages, UI components, message catalogs and the theme palette: they are what
  makes one application different from another.

The [roadmap](../README.md#roadmap) lists the order in which the rest moves to
the packages.

## `@evertondgn/solid-tooling`

`vp pack` builds one file in `dist/` for each entry in
`packages/solid-tooling/vite.config.ts`, with its type declarations, and writes
the `exports` map of the package from those entries. `tsconfig.base.json` is
exported as is.

| Entry point              | Used for                                           |
| ------------------------ | -------------------------------------------------- |
| `./lint`                 | The lint preset, imported in `vite.config.ts`      |
| `./fmt`                  | The formatter preset, imported in `vite.config.ts` |
| `./project-plugin`       | Oxlint plugin with the `project/*` rules           |
| `./backend-plugin`       | Oxlint plugin with the `backend/*` rules           |
| `./architecture-plugin`  | Oxlint plugin with the `architecture/*` rules      |
| `./solid-plugin`         | `eslint-plugin-solid`, resolved from the package   |
| `./css-filename`         | The CSS filename check, also run by `./stylelint`  |
| `./knip`                 | The Knip config, in `tooling/knip.ts`              |
| `./stylelint`            | The CSS lint, run by `tooling/css/check.ts`        |
| `./tsconfig.base.json`   | Base for the application `tsconfig.json`           |
| `./tsconfig.app.json`    | The base plus the types and `include` of the app   |
| `./vite`                 | `defineSolidApp()`, the whole `vite.config.ts`     |
| `./vitest`               | The Vitest projects, imported in `vite.config.ts`  |
| `./playwright`           | The Playwright config, in `playwright.config.ts`   |
| `./vitest-setup/browser` | Setup file of the browser tests                    |
| `./playwright-teardown`  | Server log check after the end-to-end tests        |

The lint preset registers the plugins in `lint.jsPlugins` by package specifier,
such as `@evertondgn/solid-tooling/project-plugin`. Oxlint resolves them from
the application, and with Bun's isolated linker the application only sees its
direct dependencies. That is why `./solid-plugin` re-exports
`eslint-plugin-solid`: the package depends on it, and the application does not
have to declare it. For the same reason, `./stylelint` passes
`stylelint-use-nesting` to Stylelint by a path resolved from the package.

`./knip` and `./stylelint` take the application folder as `root` and add a
default entry, project pattern or theme reference only when its file exists:
Knip fails on an entry without files, and Stylelint on a reference without
files.
[ADR 0013](ADRs/0013-knip-and-stylelint-configs-in-the-tooling-package.md)
records the choices.

`vite-plus` and `@inlang/paraglide-js` are peer dependencies pinned to the exact
versions the package is tested with; Paraglide is optional. An application that
upgrades either one needs a package version tested with the new version.

`./vite` builds the whole `vite.config.ts` of an application and loads
`@solidjs/vite-plugin`, `nitro`, `filesystem-routing` and `unplugin-icons` with
`import()` inside `lazyPlugins`, so lint and format runs never load them. They
are optional peer dependencies, pinned the same way, and the application keeps
them as direct dependencies: Bun applies `overrides` and patches only from the
root `package.json` of the application. Code that is still in the application,
such as the i18n plugin and the publication artifacts, enters through the
`extend` option. [ADR 0012](ADRs/0012-application-config-preset.md) records the
options and what stays out of them. Each feature is turned on only when the
application uses it: `ssr: false` builds a client-only application without
Nitro, the rules of the published files need `publication: true`, and the
Paraglide task, test setup and lint plugin follow the presence of Paraglide
([ADR 0016](ADRs/0016-optional-application-features.md)).

The rules read import specifiers and file paths as text, and they expect the
boilerplate layout: `src/` with `components/atoms`, `molecules` and `organisms`,
`helpers`, `infra` and the other layers, and `tooling/` for build and test code.
The [lint guide](tooling/lint.md) lists each rule and its limits.

## `@evertondgn/solid-runtime`

The package ships TypeScript source, and the application's Vite compiles it
([ADR 0003](ADRs/0003-runtime-package-as-source.md)). It is private and stays
out of release-please until its first publish. The first slice holds the
middleware steps; the application keeps the file that joins them and picks the
steps, so translations and Markdown stay optional
([ADR 0018](ADRs/0018-runtime-package-middleware.md)).

- Each module has its own entry point, with only the `solid` condition, pointing
  to the `.ts` file. There is no barrel, so a module the application does not
  import never enters its build.
- The security step is a factory, `createSecurityHeaders`, whose `headers` and
  `cspDirectives` options replace the default values. The application calls it
  once and every step that writes a response uses that instance
  ([ADR 0019](ADRs/0019-runtime-security-headers-options.md)).
- The default header values are the exception to the `.ts` entries:
  `constants.js` with `constants.d.ts`, under `types` and `default`, because the
  application module that spreads them is loaded by `vite.config.ts` through
  Node, which refuses TypeScript inside `node_modules`.
- `sideEffects` is an empty list. A module with an intended effect, such as a
  client entry, has to enter it; `false` would let the build drop that module
  without an error.
- The Solid Vite plugin adds the `solid` condition to the application build. The
  Vitest node project does not load that plugin, so `solidTest` resolves the
  packages of its `sourcePackages` option through the condition, and
  `tsconfig.app.json` sets it for TypeScript.

The [package README](../packages/solid-runtime/README.md) lists the entry
points.

## How the packages are tested

| Level                           | What it proves                                                                                                                                               | Command                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Rule tests                      | Each rule accepts and rejects the expected code, through `RuleTester` and through the Oxlint CLI                                                             | `vp run test`                                         |
| Runtime tests                   | The middleware steps of the runtime package, in its own Vitest                                                                                               | `vp run test`                                         |
| Runtime checks                  | Lint, types and unused code of the runtime package, checked in its folder as in an application                                                               | `vp run check`, `vp run dead-code`                    |
| Tooling tarball test            | The packed tooling package installs in a separate application and its plugins load                                                                           | `vp run test:tarball`                                 |
| Runtime tarball test            | The packed runtime package holds every target of `exports` and no tests, and its header constants load in Node                                               | `vp run test:tarball`                                 |
| Installed application scenarios | Three minimal applications install both tarballs with both Bun linkers, then lint, type check, test and build; SSR preview and disabled features are checked | `vp run test:scenarios`                               |
| Boilerplate application         | A complete application passes its check, unit, browser, build and end-to-end suites                                                                          | See [Development](development.md#the-boilerplate-app) |

The tarball tests exist because a workspace link hides one failure: Node refuses
to run TypeScript from `node_modules`, so a package that only works through the
link breaks once it is installed from npm. The runtime tarball test does not
compile the `.ts` entries: Node cannot run them. The installed application
scenarios compile them from the tarball, while the boilerplate copy compiles
them through the workspace link
([ADR 0020](ADRs/0020-runtime-package-checks-in-its-own-folder.md)).
