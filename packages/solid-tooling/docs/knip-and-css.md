# Knip and CSS

The Knip preset ignores `happy-dom`, `@vitest/coverage-v8` and
`@testing-library/jest-dom`, which Knip attributes to the resolved application
config even though the test preset owns them. Set `packagedTestTools: false`
when defining your own test config and declaring those dependencies, as the
runtime package does. Direct imports still require application declarations.
When the application declares `@solidjs/diagnostics`, the preset also ignores
it: the Solid plugin reads that declaration to serve `/__solid/diagnostics` in
development, and only the virtual module of the plugin imports the package.

[Tooling reference](README.md)

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

Run `vp run knip --config tooling/knip.ts`, then add `--strict`. The task uses
the package-owned `knip-bun` executable. The icons plugin of the preset resolves
the `icon:` imports, which Knip reads as a package named `icon`, and loads each
`@iconify-json/*` collection by its name, so the config ignores each of them
when the application has it, without an application dependency on that plugin;
an ignore that matched nothing would be a configuration hint. The config finds
the `icon:` imports, re-exports and dynamic imports of `src/` and `tooling/`
with the parser of `vite-plus`, so one in a comment or a string adds no ignore.
An import in a file that no entry reaches still adds it: Knip reports that file
as unused and the ignore as a configuration hint, and both go away when the file
is used or removed. A dynamic import counts when its path is a string or a
template without `${}`, the two that Knip reads and the only two that the icons
plugin resolves. A path that the code builds, as in
`import('icon:brand/' + name)` or ``import(`icon:brand/${name}`)``, gets no
report from Knip and no ignore from the config, and the build ends without a
warning, but the import fails at run time: the plugin leaves it as written, and
the browser does not load an `icon:` specifier. For a name known at run time,
map each name to its own import, as in
`{ logo: () => import('icon:brand/logo') }`, which Knip reads and the plugin
resolves. When a file of `src/` or `tooling/` imports or re-exports
`@evertondgn/vite-plugin-solid-icons/types` and `package.json` does not declare
the plugin, the config ignores `@evertondgn/vite-plugin-solid-icons`: this
package declares that entry, so the application types its icons without the
plugin. The ignore covers the whole package, so Knip then reports no other
import of the plugin in that application. An import inside a type, as in
`typeof import('icon:brand/logo')` or
`import('@evertondgn/vite-plugin-solid-icons/types').IconComponent`, adds no
ignore. Knip reports it as an unlisted dependency when it is the only icon
import, or the only import of `/types`, in the application: an icon import, or
an `import type` of `/types`, in another file adds the ignore, which then covers
it. Write it as an `import type` at the top of the file. The config also ignores
the unlisted import of `src/icon-collections.d.ts`, the declarations that the
plugin writes. It lists:

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
