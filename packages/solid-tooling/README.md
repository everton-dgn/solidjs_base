[![Latest solid-tooling version on npm](https://img.shields.io/npm/v/@evertondgn/solid-tooling)](https://www.npmjs.com/package/@evertondgn/solid-tooling)
[![CI workflow status](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml/badge.svg)](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/everton-dgn/solidjs_base/blob/main/LICENSE)

# @evertondgn/solid-tooling

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/everton-dgn/solidjs_base/main/docs/assets/readme/hero-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/everton-dgn/solidjs_base/main/docs/assets/readme/hero-light.webp" />
  <img src="https://raw.githubusercontent.com/everton-dgn/solidjs_base/main/docs/assets/readme/hero-light.webp" alt="Solid Base for SolidJS 2 and Vite+. Shared tooling and runtime beneath the SolidJS mark: languages, theme, server protection, SEO, assets and development tools. Install solid-tooling for development and solid-runtime for application features." width="800" />
</picture>

| Available package                                                                                                              | Role                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [`@evertondgn/solid-tooling`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/README.md)          | Shared config, tools, catalog generation, icons and fonts                              |
| [`@evertondgn/solid-runtime`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-runtime/README.md), `0.1.0` | Optional locale and theme behavior, middleware, error protection, env, SEO and sitemap |

Solid Base supplies lint rules, application config, test setups and Git hooks
for SolidJS 2 with [Vite+](https://viteplus.dev/guide/) as one versioned
dependency, so you stop maintaining the same tooling in every Solid app. In an
application that already uses Vite+:

```bash
vp add -D @evertondgn/solid-tooling
```

Built for applications that follow the
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs)
layout. SolidJS 2 is still a release candidate, and the package is tested with
it. Start with lint and formatting, and adopt the full application config when
you are ready.

## Requirements

Install the exact Vite+ version listed in the package's `peerDependencies`. The
package supplies its build, test, type-check and hook tools. Applications keep
their own direct imports and the Vite+ overrides; see the
[dependency requirements](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/limits.md#requirements).
An application with translations also installs the required version of
`@inlang/paraglide-js` and its message-format plugin.

## Quick start

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

Check your code and format your files:

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

## Why

Applications copied from a starter carry its tooling with them, and every fix to
the base has to be repeated by hand in each copy. With this package, the fix
arrives when you update a dependency.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/everton-dgn/solidjs_base/main/docs/assets/readme/before-after-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/everton-dgn/solidjs_base/main/docs/assets/readme/before-after-light.webp" />
  <img src="https://raw.githubusercontent.com/everton-dgn/solidjs_base/main/docs/assets/readme/before-after-light.webp" alt="About 86 percent fewer lines across five configuration areas, from 945 to 136: Vite 427 to 59, Playwright 173 to 17, Knip 129 to 40, TypeScript 45 to 9, and Stylelint 171 to an 11-line script. Each bar shows the fraction retained in the app." width="800" />
</picture>

Measured on the original starter and the same application using this package.
Compare the
[original config](https://github.com/everton-dgn/boilerplate_solidjs/blob/61454937472d0faa1b4fab985fd7c5da968aa9a6/vite.config.ts)
with the
[application config](https://github.com/everton-dgn/solidjs_base/blob/main/apps/boilerplate/vite.config.ts),
or read the
[full comparison](https://github.com/everton-dgn/solidjs_base/blob/main/README.md#before-and-after).

## What you get

| Area                            | Entry                                         | Guide                                                                                                                     |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Oxlint preset and project rules | `./lint`                                      | [Lint](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/lint.md)                                        |
| Oxfmt settings                  | `./fmt`                                       | [Formatting](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/typescript-and-format.md#formatter)       |
| TypeScript configs              | `./tsconfig.base.json`, `./tsconfig.app.json` | [TypeScript](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/typescript-and-format.md#typescript-base) |
| Whole application config        | `./vite`                                      | [Application config](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/app-config.md)                    |
| Vitest and Playwright           | `./vitest`, `./playwright`                    | [Testing](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/testing.md)                                  |
| Unused code and CSS policy      | `./knip`, `./stylelint`                       | [Knip and CSS](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/knip-and-css.md)                        |
| Commit messages and Git hooks   | `./commitlint`, `./lefthook.yml`              | [Commits and hooks](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/commits-and-hooks.md)              |

Your application keeps its pages, components, translations, theme, `App`,
`Document`, entries and middleware. The
[entry-point reference](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/README.md#entry-points)
also lists the plugins and test setup exports.

## Your application config in one call

With the application dependencies installed, `defineSolidApp()` supplies the
plugins, build settings, tasks, lint, format and three Vitest projects:

```ts
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

import { SECURITY_HEADERS } from './src/middleware/securityHeaders/constants.ts'

export default defineSolidApp({
  root: import.meta.dirname,
  middleware: './src/middleware/index.ts',
  securityHeaders: SECURITY_HEADERS
})
```

You keep your middleware and header values. SSR uses Nitro with the Vercel
preset. Its plugins are package dependencies pinned to the tested versions. The
`knip`, `tsc`, `playwright`, `lefthook` and `commitlint` tasks run the
package-owned binaries, including with an isolated installation.

| Feature             | Selection                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Client-only build   | Set `ssr: false` and omit SSR options such as `middleware` and `securityHeaders`; the build has no Nitro or server bundle              |
| Publication headers | Set `publication: true` for llms and Markdown rules; `seo.sitemap: true` adds sitemap rules                                            |
| Translations        | `project.inlang/settings.json` enables the generation task and browser test setup; the lint plugin loads only where Paraglide resolves |

See
[all options and extension points](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/app-config.md)
and the
[known limits](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/limits.md#known-limits).

## Optional application fonts

Pass a data-only `fonts` array to `defineSolidApp` to generate external
`@font-face` CSS and matching preloads for application-owned files. SSR uses
`FontLinks` from `@evertondgn/solid-runtime/fonts/font-links` in the Document
head; client-only applications receive both links in `index.html`. Without
`fonts`, nothing is generated. Typography tokens stay in the app. See the
[font API and migration examples](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/fonts.md).

## Optional SEO configuration

For SSR,
`seo: { robots: { groups, sitemapPaths, cacheControl }, sitemap: true }`
configures the runtime robots route using serializable data. `originEnv`
defaults to `VITE_SITE_URL`; the value must be an HTTP(S) origin without a path,
query, fragment or credentials. The preset validates it when SEO is enabled or
the runtime origin entry is imported. No SEO means no required origin.

Pass `site` directly to the runtime `createSeo` primitive. A meta/JSON-LD-only
application can omit `seo`, provide its own `site.url` and omit robots entirely.
Client-only applications omit both the option and runtime SEO imports. There are
no `siteModule`, `sourcesModule` or `editorialModule` path options.
`seo.sitemap` controls only the static `/sitemap.xml` and `/sitemaps/pages/**`
header rules. Install the runtime factory in explicit application route files,
and list the root in `robots.sitemapPaths` to advertise it. To remove sitemap,
remove its routes and server binding, omit its array metadata, omit
`sitemapPaths`, and omit or disable `seo.sitemap`. Robots can stay enabled. The
preset does not discover executable source registries or install routes. See the
[runtime SEO API](../solid-runtime/README.md#optional-seo) for factories, the
one-line route and examples with and without translations.

## Optional environment validation

An SSR application can add `env.ts` with the preset's optional validators:

```ts
import { serverEnv } from '@evertondgn/solid-runtime/env'

const env = { server: { ...serverEnv } }

export default env
```

`HOST`, `PORT` and `BASE_URL_TEST` are optional; `PORT` produces a number.
Declare the runtime package in `dependencies` and keep the tooling in
`devDependencies`: Knip treats `env.ts` as production code. Extend `server` and
`client` with the application's own Standard Schema validators. The runtime
supplies Valibot for its fragment; declare a validator library in the
application only when its own code imports it. The optional SEO configuration
validates `VITE_SITE_URL` separately. An application without `env.ts` keeps
working, including client-only applications with no site URL.

The Solid plugin generates inferred types and rejects server env imports in the
client graph. The server virtual module bundles the fragment and validator; env
validation adds neither to the client. See the
[environment guide](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/app-config.md#optional-environment-validation)
for extension examples, boot validation and type generation.

## How it is verified

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/everton-dgn/solidjs_base/main/docs/assets/readme/verified-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/everton-dgn/solidjs_base/main/docs/assets/readme/verified-light.webp" />
  <img src="https://raw.githubusercontent.com/everton-dgn/solidjs_base/main/docs/assets/readme/verified-light.webp" alt="At this revision: 775 runtime and 394 application Vitest tests, 1169 combined; 164 fixture E2E cases and 155 production E2E cases, 319 enumerated. Installed tarballs check exports and builds with both Bun linkers. Release workflows use npm trusted publishing." width="800" />
</picture>

Package changes run against the complete boilerplate and the runtime package in
CI, with more than 1,000 Vitest tests and more than 300 end-to-end tests. Before
each release, the tarball test installs the packed package in a separate
application outside the workspace and checks its exports and lint rules.

The workflow publishes to npm with signed provenance through trusted publishing,
without a stored npm token. See the
[CI coverage](https://github.com/everton-dgn/solidjs_base/blob/main/docs/development.md#ci)
and the
[release process](https://github.com/everton-dgn/solidjs_base/blob/main/docs/releasing.md).

## Reference

- [Lint rules and customization](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/lint.md)
- [Application config, plugins and tasks](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/app-config.md)
- [Vitest and Playwright](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/testing.md)
- [Knip and CSS](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/knip-and-css.md)
- [Commit messages and Git hooks](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/commits-and-hooks.md)
- [TypeScript and formatting](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/typescript-and-format.md)
- [Requirements, limits and versions](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/limits.md)

## Versions and license

The package follows semantic versioning. Below 1.0.0, a breaking change raises
the minor version. Read the
[changelog](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/CHANGELOG.md)
for each release.

[MIT](https://github.com/everton-dgn/solidjs_base/blob/main/LICENSE)
