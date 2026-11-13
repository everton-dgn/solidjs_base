# solidjs_base

[![CI](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml/badge.svg)](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@evertondgn/solid-tooling?label=%40evertondgn%2Fsolid-tooling)](https://www.npmjs.com/package/@evertondgn/solid-tooling)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The shared base of SolidJS 2 applications built with
[Vite+](https://viteplus.dev/guide/), published as npm packages.

## Why

[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs) is a
SolidJS 2 starter with SSR, Nitro, Paraglide i18n and a Vercel deploy. An
application created from it is a copy, and the copy carries everything that is
not specific to it: about 15,000 lines of tooling (lint rules, config, release
scripts) and 8,000 lines of runtime code (security headers, server errors, SEO,
sitemap, `llms.txt`). A fix to that base has to be applied by hand in every
copy.

This repository moves the base into versioned packages. An application gets a
fix by updating a dependency, and keeps only its pages, components, translations
and configuration.

## Packages

| Package                                               | What an application gets                                                                  | Status                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`@evertondgn/solid-tooling`](packages/solid-tooling) | Oxlint preset with the project rules, Oxfmt settings and a TypeScript base config         | [![npm](https://img.shields.io/npm/v/@evertondgn/solid-tooling)](https://www.npmjs.com/package/@evertondgn/solid-tooling) |
| `@evertondgn/solid-runtime`                           | Middleware, security headers and CSP, server errors, i18n runtime, SEO, sitemap, Markdown | Planned, see [ADR 0003](docs/ADRs/0003-runtime-package-as-source.md)                                                      |

## Quick start

In an application built with Vite+, add the package:

```bash
vp add -D @evertondgn/solid-tooling
```

It also needs `@inlang/paraglide-js`, in the exact version listed in its
`peerDependencies`. The
[package README](packages/solid-tooling/README.md#requirements) explains why.

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

`vp check` and `vp lint` now apply the preset. This is the output for two files
of [`fixtures/consumer`](fixtures/consumer) with version 0.2.0 installed from
npm:

```text
src/helpers/layer.ts:1:1: error architecture(layer-imports): Layer base must not depend on atoms (src/components/atoms/label.ts). See the layer rules in docs/architecture.md.
src/helpers/export-list.ts:3:1: error project(no-export-list): Export on the declaration itself (export function, export const, export type) instead of using export { ... }. An export list is only allowed in a re-export with from.
```

The [package README](packages/solid-tooling/README.md) lists every rule, the
entry points and how to change the preset.

## Roadmap

The goal is an application that keeps only its pages, UI components,
translations, theme palette and a short `vite.config.ts`. Next steps, in order:

1. A `defineSolidApp()` preset for Vite, Nitro, Vitest and Playwright, plus
   shared configs for Knip, Stylelint, commitlint and Lefthook.
2. The runtime package: security headers and CSP, middleware, server errors.
3. i18n runtime and the Paraglide generator.
4. SEO, sitemap, `robots.txt`, `llms.txt` and Markdown pages.
5. Theme logic and the remaining primitives.
6. Reusable workflows for the CI and the releases of applications.
7. A `vp create` template for new applications.

## Repository layout

```text
packages/solid-tooling/   the published package
apps/boilerplate/         copy of boilerplate_solidjs that runs on the workspace package
fixtures/consumer/        small application that installs the packed tarball
docs/                     guides and architecture decision records
.github/                  CI, release workflow, issue and pull request templates
```

## Documentation

- [Development](docs/development.md): the workspace, the tests and the CI.
- [Architecture](docs/architecture.md): what goes in each package and what stays
  in the application.
- [Releasing](docs/releasing.md): versions, publishing and recovery when a
  publish fails.
- [ADRs](docs/ADRs/README.md): why the repository works this way.

## Contributing

Issues and pull requests are welcome. Read the
[contributing guide](CONTRIBUTING.md) before you start. Report security problems
privately, as [SECURITY.md](SECURITY.md) explains.

## License

[MIT](LICENSE)
