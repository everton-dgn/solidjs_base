# Lint

[Tooling reference](README.md)

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
| `backend/static-solid-imports`            | No `import()` of `@solidjs/web`, its subpaths or the runtime server-error configurator                                                                     |
| `backend/static-render-integrity-imports` | No `import()` of local `renderIntegrity` or `@evertondgn/solid-runtime/server/render-integrity`                                                            |
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

- `console` is not allowed. Only the runtime package's own lint configuration
  permits `console.error` in its `src/infra/server/logServerFailure/index.ts`.
- `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` are not allowed.
  `src/infra/server/requestJson/index.ts` is the only module that may call
  `fetch`.
- The Node transports (`http`, `https`, `http2`, `net`, `tls`, `undici`) cannot
  be imported.
- `markSafeError` and `SAFE_ERROR` cannot be imported by application code. The
  runtime package alone permits them in its
  `src/infra/server/publicErrors/index.ts`.
- `configureServerErrors` from `@solidjs/web`, the
  `@solidjs/web/server-functions` subpath and `observeRenderFailures` from the
  application's or runtime package's `renderIntegrity` module can only be
  imported in `src/infra/server/configureServerErrors/index.ts`.
- The entire `@evertondgn/solid-runtime/server/configure-server-errors` subpath
  is reserved for that same setup file. Literal and template-literal dynamic
  imports are refused too. Other public server subpaths keep their normal
  imports; the build enforces `server-only` against client use.
- The application setup file must not export anything, including types,
  defaults, empty export lists or reexports. This prevents consumers from
  obtaining the configurator through the setup module or another barrel.
- Imports and reexports cannot contain a `node_modules` path segment. Consumers
  must use public package exports. The backend rules normalize `/./`, repeated
  separators and `..` before matching restrictions. The physical-path check also
  keeps the original segments, so `node_modules/..` cannot erase the violation.
- A relative import goes up at most three levels. Use `@/` beyond that.

Test files and `.d.ts` files are exempt from all of these except the relative
import limit.

`backend/restricted-imports` applies the normalized import restrictions;
`backend/no-setup-exports` enforces the application's setup boundary. Computed
imports remain outside static specifier analysis.

The runtime's `vite.config.ts` owns the exact-path exceptions for public error
marking, central logging and Node imports in `publicationScope/index.ts`. It
also permits its own configurator to export the public API. None grants those
privileges to an application's same-named module or an `index.mts` sibling. The
shared preset keeps the application setup's configuration imports, the
`requestJson/index.ts` fetch exception and `server-only` imports in
`src/infra/server/**/index.ts`, since applications still contain those modules.
The public operation type rejects `allowControl` when it appears in the static
argument type. Narrowing to a type containing only `run` can hide the extra
field, but the public wrapper discards it at runtime. The control-enabled
implementation and public-message setter have no subpath exports.

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
