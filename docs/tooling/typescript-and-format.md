# TypeScript and formatting

[Tooling reference](README.md)

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

It also sets `customConditions` to `solid`, so TypeScript reads the files of a
package that exports its source under that condition, such as
`@evertondgn/solid-runtime`.

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
