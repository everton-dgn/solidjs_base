# Solid Base

Stop maintaining the same tooling in every Solid app.

Lint rules, application config, test setups and Git hooks for SolidJS 2 with
[Vite+](https://viteplus.dev/guide/), delivered as one versioned dependency. In
the starter it came from, one `defineSolidApp()` call replaced a 427-line
`vite.config.ts` with 56 lines.

Built for applications that follow the
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs)
layout. SolidJS 2 is still a release candidate, and the package is tested with
it. Start with lint and formatting, and adopt the full application config when
you are ready.

[![CI workflow status](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml/badge.svg)](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml)
[![Latest solid-tooling version on npm](https://img.shields.io/npm/v/@evertondgn/solid-tooling?label=%40evertondgn%2Fsolid-tooling)](https://www.npmjs.com/package/@evertondgn/solid-tooling)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Quick start](#quick-start) · [Before and after](#before-and-after) ·
[What you get](#what-you-get) · [Only what you use](#only-what-you-use) ·
[How it is verified](#how-it-is-verified) · [Documentation](#documentation)

![Three application windows connected to one shared foundation](docs/assets/readme/hero.webp)

## Fix the base once

![Separate configuration copies drift and need repeated repairs, while one shared package supplies all applications](docs/assets/readme/drift.webp)

[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs) is a
complete starter with SSR, Nitro, Paraglide translations and a Vercel deploy.
Each application copied from it carries about 15,000 lines of tooling and 8,000
lines of runtime code. Every fix to the base must be repeated by hand.

Solid Base moves shared tooling into `@evertondgn/solid-tooling`. You receive
its fixes by updating a dependency. Your application still owns its runtime: the
runtime package has started in this repository and is not published yet, as the
[roadmap](#roadmap) shows.

## Before and after

| Configuration         | Original lines |               With the package |
| --------------------- | -------------: | -----------------------------: |
| `vite.config.ts`      |            427 |                             56 |
| Playwright config     |            173 |                             17 |
| Knip config           |            129 |                             48 |
| `tsconfig.json`       |             45 |                              9 |
| Stylelint config      |            171 | 0, called by an 11-line script |
| Lint preset and rules |    About 1,500 |                              0 |

These are configuration line counts from the original starter and the same
application using the package. Compare the
[original Vite config](https://github.com/everton-dgn/boilerplate_solidjs/blob/61454937472d0faa1b4fab985fd7c5da968aa9a6/vite.config.ts)
with [the application's config](apps/boilerplate/vite.config.ts).

Git hooks are not in the table because that application lives inside this
repository and has no hooks of its own. The starter keeps a 58-line
`.lefthook.yml` and a 9-line `.commitlintrc`; an application that extends the
package keeps 2 lines and 1 line, as in the
[consumer fixture](fixtures/consumer).

## Quick start

In an application that already uses Vite+ and TypeScript, add the package:

```bash
vp add -D @evertondgn/solid-tooling
```

Use the tested Vite+ version from the package's
[`peerDependencies`](packages/solid-tooling/package.json). Optional entries have
[additional requirements](docs/tooling/limits.md#requirements).

Add `fmt` and `lint` to your existing Vite+ config. The example shows only those
settings; keep your plugins and other options:

```ts
import { fmt } from '@evertondgn/solid-tooling/fmt'
import { lint } from '@evertondgn/solid-tooling/lint'
import { defineConfig } from 'vite-plus'

export default defineConfig({ fmt, lint })
```

In `tsconfig.json`:

```json
{
  "extends": "@evertondgn/solid-tooling/tsconfig.base.json",
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "vite.config.ts"]
}
```

Run the checks and format your files:

```bash
vp check
vp fmt
```

To see a rule of the package fire, create `src/helpers/export-list.ts`:

```ts
const example = 1

export { example }
```

Run `vp lint`. The preset reports the export list:

```text
src/helpers/export-list.ts:3:1: error project(no-export-list): Export on the declaration itself (export function, export const, export type) instead of using export { ... }. An export list is only allowed in a re-export with from.
```

The [lint guide](docs/tooling/lint.md#rules-of-this-package) lists every rule of
the package.

## What you get

| The package maintains                                                                                               | You keep in your application                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Oxlint preset and rules for architecture layers, backend boundaries, exports, SEO modules, test names and CSS names | Your code and any rule overrides                                              |
| Oxfmt settings and TypeScript base and application configs                                                          | Your aliases and application paths                                            |
| `defineSolidApp()`: plugins, build settings, tasks and static-file header rules                                     | `App`, `Document`, entries, middleware, header values and application plugins |
| Vitest node, DOM and browser projects, plus the Playwright config                                                   | Your tests, fixtures and routes                                               |
| Knip config and Stylelint with a CSS token policy                                                                   | Your entry points, components, theme and tokens                               |
| Commitlint config and Lefthook hooks                                                                                | Your application scripts and hook customizations                              |

![A toolbox with a gear, a ruler and a check mark connects to an application window](docs/assets/readme/ownership.webp)

The presets expect the boilerplate's folder layout. Peer dependencies use exact
versions, and SSR uses Nitro with the Vercel preset. Read the
[requirements and limits](docs/tooling/limits.md) before adopting the full
application config.

## Your application config in one call

For a boilerplate application with the
[application dependencies installed](docs/tooling/limits.md#requirements),
`defineSolidApp()` supplies the whole Vite config, including lint, format and
the three Vitest projects:

```ts
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

import { SECURITY_HEADERS } from './src/middleware/securityHeaders/constants.ts'

export default defineSolidApp({
  root: import.meta.dirname,
  middleware: './src/middleware/index.ts',
  securityHeaders: SECURITY_HEADERS
})
```

You provide your middleware and header values. Add your own plugins through
`extend`, or override tasks by name. The
[application config guide](docs/tooling/app-config.md) covers every option.

## Only what you use

| Feature          | How you select it                                                     | What changes                                                                                                              |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Server rendering | SSR is on by default; set `ssr: false` for a client-only app          | No Nitro, server functions or server bundle in client-only mode                                                           |
| Publication      | Set `publication: true`                                               | Adds header rules for published files such as the sitemap, `robots.txt`, `llms.txt` and Markdown pages                    |
| Translations     | Keep `project.inlang/settings.json` and install Paraglide when needed | The settings file enables the generation task and browser test setup; the lint plugin loads only where Paraglide resolves |

![Independent feature modules connect to an application through switches, with unused modules detached](docs/assets/readme/optional.webp)

A client-only application can use this config after installing the
[required tools](docs/tooling/limits.md#requirements):

```ts
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

export default defineSolidApp({ root: import.meta.dirname, ssr: false })
```

A minimal client-only application built this way produced an `index.html` and
one 29 KB script, with no server output.
[ADR 0016](docs/ADRs/0016-optional-application-features.md) records the decision
and the measurements.

## How it is verified

| Check                              | What it covers                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete boilerplate in CI         | Package changes run against the application, with more than 1,000 Vitest tests and more than 300 end-to-end tests                              |
| Installation outside the workspace | Before each release, the tarball test packs the package, installs it in a separate application and checks the installed exports and lint rules |
| Workflow publication               | npm receives signed provenance through trusted publishing, without a stored npm token                                                          |

![A package moves through installation in a separate application, a test gate and release](docs/assets/readme/verified.webp)

The [development guide](docs/development.md#ci) describes which CI jobs run for
each change. The [release guide](docs/releasing.md) documents validation and
publication.

[Add the package to your application](#quick-start), then use the
[tooling reference](docs/tooling/README.md) to choose the presets you need.

## Packages and roadmap

| Available package                                               | What it provides                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`@evertondgn/solid-tooling`](packages/solid-tooling/README.md) | Lint, formatting, TypeScript, application config, testing, Knip, CSS lint, commitlint and Git hooks |

### Roadmap

| Planned work                      | Scope                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@evertondgn/solid-runtime`       | Started, not published: the [middleware steps](packages/solid-runtime/README.md). Planned: server errors, i18n, SEO, sitemap, publication, theme logic and remaining primitives |
| Reusable CI and release workflows | Shared automation for applications                                                                                                                                              |
| `vp create` template              | New applications using the packages                                                                                                                                             |

These items are not available yet. The application still owns its pages,
components, translations and theme, as well as the runtime files listed in
[the architecture guide](docs/architecture.md#what-stays-in-the-application).

## Documentation

| Guide                                       | What you will find                           |
| ------------------------------------------- | -------------------------------------------- |
| [Tooling reference](docs/tooling/README.md) | Every preset, option, rule and limit         |
| [Development](docs/development.md)          | Workspace setup, tests and CI                |
| [Architecture](docs/architecture.md)        | Package boundaries and application ownership |
| [Releasing](docs/releasing.md)              | Versions, publishing and recovery            |
| [ADRs](docs/ADRs/README.md)                 | The decisions behind the project             |

The [documentation index](docs/README.md) links to all guides.

## Contributing

Read the [contributing guide](CONTRIBUTING.md) before opening an issue or pull
request. Report security problems privately, as [SECURITY.md](SECURITY.md)
explains.

## License

[MIT](LICENSE)
