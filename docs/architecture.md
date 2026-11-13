# Architecture

## Where code lives

An application built from boilerplate_solidjs takes code from three places.

| Place                       | Content                                                                                                                                         | Shipped as                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `@evertondgn/solid-tooling` | Lint preset, the `project`, `backend`, `architecture` and `solid` lint plugins, formatter preset, TypeScript base                               | Compiled JavaScript with type files |
| Runtime package (planned)   | Middleware, security headers, server errors, i18n runtime, primitives, and the sitemap, robots and llms.txt handlers as factories               | TypeScript source                   |
| The application             | Pages, UI components, message catalogs, `App`, `Document`, the `entry-*` pair, a thin middleware, one-line SEO routes, version pins and patches | Its own repository                  |

The two packages ship in different forms because of how each one runs. See
[ADR 0002](ADRs/0002-compiled-tooling-package.md) and
[ADR 0003](ADRs/0003-runtime-package-as-source.md).

## What stays in the application

Some files cannot move to a package:

- `App`, `Document`, the `entry-*` pair and the middleware: the Solid Vite
  plugin requires their paths to be inside the Vite root.
- Version pins and patches: Bun reads `overrides` and `patchedDependencies` only
  from the root `package.json` of the project that installs.
- Pages, UI components and message catalogs: they are what makes one application
  different from another.

## `@evertondgn/solid-tooling`

`vp pack` builds one file in `dist/` for each entry in
`packages/solid-tooling/vite.config.ts`, with its type declarations, and writes
the `exports` map of the package from those entries. `tsconfig.base.json` is
exported as is.

| Entry point             | Used for                                           |
| ----------------------- | -------------------------------------------------- |
| `./lint`                | The lint preset, imported in `vite.config.ts`      |
| `./fmt`                 | The formatter preset, imported in `vite.config.ts` |
| `./project-plugin`      | Oxlint plugin with the `project/*` rules           |
| `./backend-plugin`      | Oxlint plugin with the `backend/*` rules           |
| `./architecture-plugin` | Oxlint plugin with the `architecture/*` rules      |
| `./solid-plugin`        | `eslint-plugin-solid`, resolved from the package   |
| `./css-filename`        | The CSS filename check, for the CSS lint script    |
| `./tsconfig.base.json`  | Base for the application `tsconfig.json`           |

The lint preset registers the plugins in `lint.jsPlugins` by package specifier,
such as `@evertondgn/solid-tooling/project-plugin`. Oxlint resolves them from
the application, and with Bun's isolated linker the application only sees its
direct dependencies. That is why `./solid-plugin` re-exports
`eslint-plugin-solid`: the package depends on it, and the application does not
have to declare it.

`vite-plus` and `@inlang/paraglide-js` are peer dependencies pinned to the exact
versions the package is tested with. An application that upgrades either one
needs a package version tested with the new version.

The rules read import specifiers and file paths as text, and they expect the
boilerplate layout: `src/` with `components/atoms`, `molecules` and `organisms`,
`helpers`, `infra` and the other layers, and `tooling/` for build and test code.
The [package README](../packages/solid-tooling/README.md) lists each rule and
its limits.

## Runtime package

It is not built yet. A test application that installed packages by tarball
showed which form works, and ADR 0003 records the result: TypeScript source with
the `solid` export condition, plus an `@paraglide` alias and `ssr.noExternal`
set by a preset.

## How the packages are tested

| Level                   | What it proves                                                                                   | Command                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Rule tests              | Each rule accepts and rejects the expected code, through `RuleTester` and through the Oxlint CLI | `vp run test`                                         |
| Tarball test            | The packed package installs in a separate application and its plugins load                       | `vp run test:tarball`                                 |
| Boilerplate application | A complete application passes its check, unit, browser, build and end-to-end suites              | See [Development](development.md#the-boilerplate-app) |

The tarball test exists because a workspace link hides one failure: Node refuses
to run TypeScript from `node_modules`, so a package that only works through the
link breaks once it is installed from npm.
