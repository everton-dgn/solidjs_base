# solidjs_base

Shared code for SolidJS applications built with
[Vite+](https://viteplus.dev/guide/). Each application created from
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs) used
to carry its own copy of the lint rules, the formatter settings and the
TypeScript config. This repository publishes that code as npm packages, so a fix
ships as a version update instead of a change in every application.

## Packages

| Package                                               | What an application gets                                                                     | Status                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`@evertondgn/solid-tooling`](packages/solid-tooling) | Lint and format presets, a TypeScript base config, and lint rules for the boilerplate layout | [Published on npm](https://www.npmjs.com/package/@evertondgn/solid-tooling) |
| Runtime package                                       | Middleware, security headers, server errors, i18n runtime and SEO handlers                   | Planned, see [ADR 0003](docs/ADRs/0003-runtime-package-as-source.md)        |

## Quick start

In an application built with Vite+, add the package:

```bash
vp add -D @evertondgn/solid-tooling
```

It needs `@inlang/paraglide-js` too, in the exact version listed in its
`peerDependencies`. The
[package README](packages/solid-tooling/README.md#requirements) explains the
requirements.

Use the presets in `vite.config.ts`:

```ts
import { fmt } from '@evertondgn/solid-tooling/fmt'
import { lint } from '@evertondgn/solid-tooling/lint'
import { defineConfig } from 'vite-plus'

export default defineConfig({ fmt, lint })
```

Extend the TypeScript base in `tsconfig.json`:

```json
{
  "extends": "@evertondgn/solid-tooling/tsconfig.base.json",
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "vite.config.ts"]
}
```

Then `vp check` and `vp lint` apply the preset. This is the output for two files
of [`fixtures/consumer`](fixtures/consumer) with version 0.2.0 installed from
npm:

```text
src/helpers/layer.ts:1:1: error architecture(layer-imports): Layer base must not depend on atoms (src/components/atoms/label.ts). See the layer rules in docs/architecture.md.
src/helpers/export-list.ts:3:1: error project(no-export-list): Export on the declaration itself (export function, export const, export type) instead of using export { ... }. An export list is only allowed in a re-export with from.
```

The [package README](packages/solid-tooling/README.md) lists every rule, the
entry points and how to change the preset.

## Repository layout

```text
packages/solid-tooling/   the published package
apps/boilerplate/         copy of boilerplate_solidjs that runs on the workspace package
fixtures/consumer/        small application that installs the packed tarball
docs/                     guides and architecture decision records
.github/workflows/        CI for pull requests, and the release workflow
```

## Commands

Install the global Vite+ CLI. The Node and Bun versions come from the root
`package.json`.

| Command               | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `vp install`          | Install the dependencies of the whole workspace                      |
| `vp run build`        | Compile the packages to `dist/`                                      |
| `vp run check`        | Check format, lint and types of the packages                         |
| `vp run test`         | Run the rule tests                                                   |
| `vp run test:tarball` | Install the packed package in `fixtures/consumer` and lint it        |
| `vp run validate`     | Run all of the above, in this order; the publish job runs it as well |

The application in `apps/boilerplate` has its own commands, described in the
[development guide](docs/development.md#the-boilerplate-app).

## Documentation

- [Development](docs/development.md): the workspace, the tests and the CI.
- [Architecture](docs/architecture.md): what goes in each package and what stays
  in the application.
- [Releasing](docs/releasing.md): versions, publishing and recovery when a
  publish fails.
- [ADRs](docs/ADRs/README.md): why the repository works this way.

## License

[MIT](LICENSE)
