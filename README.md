[![CI workflow status](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml/badge.svg)](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml)
[![Node version that the packages require](https://img.shields.io/node/v/@evertondgn/solid-tooling)](packages/solid-tooling/docs/limits.md#requirements)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

# Solid Base

**Build your Solid app. Stop rebuilding its foundation.**

Solid Base is three npm packages for SolidJS 2 apps on
[Vite+](https://viteplus.dev/guide/). The tooling supplies the whole
`vite.config.ts`, lint rules, test projects and Git hooks of your app. The
runtime adds security headers with a nonce CSP, private server errors, links
that keep the language, a theme set before hydration, and SEO and Markdown
publication, one import at a time. Your app keeps its pages, components, content
and backend adapters.

| Package                                                                                                                                                                                                                                  | What your app gets                                                                                                                                     | Install                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [`@evertondgn/solid-tooling`](packages/solid-tooling/README.md) [![solid-tooling version](https://img.shields.io/npm/v/@evertondgn/solid-tooling?label=%20)](packages/solid-tooling/CHANGELOG.md)                                        | The whole `vite.config.ts`, lint rules, test projects and Git hooks, as one dev dependency                                                             | `vp add -D @evertondgn/solid-tooling`                                                                                           |
| [`@evertondgn/solid-runtime`](packages/solid-runtime/README.md) [![solid-runtime version](https://img.shields.io/npm/v/@evertondgn/solid-runtime?label=%20)](packages/solid-runtime/CHANGELOG.md)                                        | Security headers with a nonce CSP, private server errors, links that keep the language, a theme set before hydration, and SEO and Markdown publication | `vp add @evertondgn/solid-runtime`                                                                                              |
| [`@evertondgn/vite-plugin-solid-icons`](packages/vite-plugin-solid-icons/README.md) [![icons plugin version](https://img.shields.io/npm/v/@evertondgn/vite-plugin-solid-icons?label=%20)](packages/vite-plugin-solid-icons/CHANGELOG.md) | Every icon of an Iconify collection or of your own SVG folder, imported by name as a typed component, with only the icons you use in the bundle        | Loaded by the tooling, or [installed alone](packages/vite-plugin-solid-icons/README.md#install) in any Vite+ app with SolidJS 2 |

Install the tooling for development and the runtime for the app:

```bash
vp add -D @evertondgn/solid-tooling
vp add @evertondgn/solid-runtime
```

The [boilerplate app](apps/boilerplate/README.md) is a complete SolidJS 2 app
built on the packages to test them; it is never published or deployed. Pick a
path in the [quick start](#quick-start).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/fix-once-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/fix-once-light.webp" />
  <img src="docs/assets/readme/fix-once-light.webp" alt="Copied configs drift between apps A, B and C. On Solid Base, thin app configs take one shared fix through vp update." width="800" />
</picture>

## Why it exists

Solid Base started as a starter app,
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs). Each
new SolidJS app copied it, with its Vite config, lint rules, test setup, Git
hooks, security headers and SEO code:
[945 lines of configuration in five files](https://github.com/everton-dgn/boilerplate_solidjs/tree/61454937472d0faa1b4fab985fd7c5da968aa9a6).
Then the copies drifted, and a fix to the base had to be made again by hand in
every app.

Now a fix lands once, in a package version, and each app takes it by
[updating the packages](#update-the-packages). This is the whole
`vite.config.ts` of a client-only app, the
[client-only fixture](fixtures/apps/client-only/vite.config.ts) without its
`fonts` block:

```ts
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

export default defineSolidApp({
  root: import.meta.dirname,
  icons: { scenario: './src/assets/icons' },
  ssr: false
})
```

On 2026-11-17, a copy with this config and the 0.8.0 packages from npm built to
`dist/index.html` and one 67.84 kB JavaScript file, with no Nitro or server
bundle. The table shows what a package version can fix and what stays in your
app:

| The packages maintain                                                           | Your application owns                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Lint, formatting, TypeScript, Vitest, Playwright, Knip, Stylelint and Git hooks | Code, tests, paths and overrides                           |
| Locale mechanics, catalog generation and theme behavior                         | Messages, locale selection, UI and palette                 |
| Middleware, error protection and publication admission                          | Header policy, public text, backend adapters and data      |
| SEO factories, the icons plugin and font loading                                | Editorial metadata, source registries, assets and licenses |

When the defaults do not fit, `defineSolidApp` takes extra plugins through
`extend`, replaces tasks by name through `tasks`, and accepts route rules,
public assets and static paths, without forking the preset. See the
[application config guide](packages/solid-tooling/docs/app-config.md).

## Why you can trust it

- The packages are tested as installed packages. In the CI run of the 0.10.0
  release pull request
  ([run 44206537981](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981)),
  the Packages job ran `vp run validate`, the checks of the publish job: 1,047
  runtime tests, 368 tooling tests and 194 icons plugin tests passed, and the
  three packed packages passed all 14 installed application cases with Bun's
  `hoisted` and `isolated` linkers. In the same run, the boilerplate app passed
  185 Vitest tests and 164 end-to-end cases against its E2E build.
- You can check where a version came from. The release workflow publishes
  through npm trusted publishing, with no stored npm token, and each version it
  publishes carries npm provenance that names the commit and the workflow run
  that built it. The first version of each package was published by hand and has
  none.
- <a name="before-and-after"></a>The configuration left in an app is counted.
  The tooling README compares the five config files of the boilerplate app with
  the starter's 945 lines, file by file, in
  [the configuration you stop maintaining](packages/solid-tooling/README.md#the-configuration-you-stop-maintaining).

[How it is verified](#how-it-is-verified) lists every suite.

## Before you adopt it

> [!IMPORTANT]
> Solid Base is young. The first package version reached npm on 2026-11-12, and
> the three packages published 0.10.0 on 2026-11-18. Below 1.0.0, a breaking
> change raises the minor version, and 0.10.0 has one in each package. The
> packages pin the versions they are tested with, so update them together and
> read the [release notes](https://github.com/everton-dgn/solidjs_base/releases)
> first ([versions](packages/solid-tooling/docs/limits.md#versions)).

| You need               | Solid Base expects                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node                   | The range in `engines.node` of each package manifest, shown by the Node badge above                                                                                                                 |
| Vite+                  | `vite-plus` at the exact version of the peer in the [tooling](packages/solid-tooling/package.json) and [icons plugin](packages/vite-plugin-solid-icons/package.json) manifests                      |
| Solid                  | `@solidjs/web` at the exact version of the peer in the [runtime](packages/solid-runtime/package.json) and icons plugin manifests                                                                    |
| A host for SSR         | Vercel's output format: Nitro always uses its `vercel` preset. A client-only build (`ssr: false`) writes a static `dist/` with no server ([applications with no server](docs/tooling/no-server.md)) |
| A folder layout        | The boilerplate layout, for the full preset, the test presets, Knip and the CSS policy. The lint and format presets need none ([known limits](packages/solid-tooling/docs/limits.md#known-limits))  |
| Room in `node_modules` | The tooling installs the tools of features you do not use: 8.41% more `node_modules` with Bun's hoisted linker, in the [ADR 0027 measurement](docs/ADRs/0027-packaged-tool-dependencies.md)         |

There is no eject command. Each runtime feature is a separate import, so you can
replace one at a time with your own code. More answers are in
[Questions before you adopt it](#questions-before-you-adopt-it).

## Quick start

Install the global [Vite+](https://viteplus.dev/guide/) CLI (`vp`) first, then
pick the path that fits:

1. [Add the packages to an existing app](#add-the-packages-to-an-existing-app):
   the lint and format presets need one dev dependency and two keys of your
   Vite+ config.
2. [Start a new app from a fixture](#start-a-new-app-from-a-fixture): copy a
   minimal app that CI installs from the packed tarballs.
3. [See the complete app](#see-the-complete-app): clone this repository and run
   the boilerplate app.

[Update the packages](#update-the-packages) is for an app that already uses
them.

### Add the packages to an existing app

To adopt only the lint and format presets, install only the tooling
(`vp add -D @evertondgn/solid-tooling`) and add two keys to your Vite+ config.
This is the whole config of the
[lint consumer fixture](fixtures/consumer/vite.config.ts):

```ts
import { fmt } from '@evertondgn/solid-tooling/fmt'
import { lint } from '@evertondgn/solid-tooling/lint'
import { defineConfig } from 'vite-plus'

export default defineConfig({ fmt, lint })
```

For the whole preset, with Vite+ and the Solid dependencies your app imports
already installed, add the tooling for development and the runtime for the app:

```bash
vp add -D @evertondgn/solid-tooling
vp add @evertondgn/solid-runtime
```

Use the versions and layout in the
[requirements](packages/solid-tooling/docs/limits.md#requirements). Write
`vite.config.ts` with `defineSolidApp`, as in the
[client-only copy](#start-a-new-app-from-a-fixture). For SSR, the
[SSR fixture's `vite.config.ts`](fixtures/apps/ssr-plain/vite.config.ts) adds
the header policy, the server error setup, the middleware and SEO. The
[application config guide](packages/solid-tooling/docs/app-config.md) covers
each option.

To add only the icons plugin to a Vite+ app with SolidJS 2, follow the
[plugin's install and setup steps](packages/vite-plugin-solid-icons/README.md#install).
Apps on the tooling skip that step: `defineSolidApp` already loads the plugin.

### Start a new app from a fixture

The three fixtures are minimal apps that CI installs from the packed tarballs:
[client-only](fixtures/apps/client-only), [SSR](fixtures/apps/ssr-plain) and
[translated SSR](fixtures/apps/ssr-i18n). Copy the folder of the closest one to
a new project outside this repository. They are test harnesses, so a copy takes
three to five changes.

<details>
<summary>The changes a copy takes, and the build they gave</summary>

These are the changes we made on 2026-11-17 to copies of client-only and SSR
with the 0.8.0 packages. The translated SSR fixture has not been tried this way
yet.

1. Add a `build` script: `"scripts": { "build": "vp build" }`. The SSR copy also
   takes `"start": "vp preview"`.
2. Remove the `fonts` block from `vite.config.ts`, or point it to a real font
   file: the harness creates `src/assets/scenario.woff2` during its run. In the
   SSR copy, also remove `FontLinks` from `src/App.tsx`.
3. Add a `.gitignore` with `node_modules`, `dist`, `src/icon-collections.d.ts`
   and `src/@types/routes.d.ts`, so `vp check` skips generated files. The SSR
   copy also lists `.vercel`, `.nitro` and `.output`.
4. SSR only: create `.env` with `VITE_SITE_URL=https://example.com`, or remove
   `seo` from `vite.config.ts`. Without either, the build fails with
   `Error: Missing site origin: VITE_SITE_URL`.
5. Delete `src/helpers/probe/`, which holds the harness tests.

Then install the packages and build:

```bash
vp add -D @evertondgn/solid-tooling
vp add @evertondgn/solid-runtime
vp run build
```

With changes 1 to 4, `vp run build` passed in both copies, and the SSR build
wrote `.vercel/output`. The client-only copy also passed `vp check`, before and
after change 5. Its build, with Node 26.13.1 and vp 1.6.0 on macOS:

```text
$ vp build ⊘ cache disabled
transforming...
✓ 93 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                 0.19 kB │ gzip:  0.16 kB
dist/assets/index-CrSh0w8D.js  67.84 kB │ gzip: 26.22 kB

✓ built in 429ms
```

Its whole `vite.config.ts` is the fixture's file without the `fonts` block, as
in [Why it exists](#why-it-exists). With `ssr: false`, the build writes
`dist/index.html` and one JavaScript file, with no Nitro or server bundle.

Before you build your app on the copy, replace the harness scaffolding: the
package name, the `scenario` icon collection and `src/assets/icons/mark.svg`,
the probe `App.tsx`, the `<27` upper bound in `engines.node`, and
`@iconify-json/hugeicons` if your app does not use that collection. The SSR copy
also has the `x-scenario-env` header in `src/middleware.ts`, the scenario labels
in `env.ts`, a `src/infra/server/renderServerError/` that throws on purpose, the
example site in `src/seo-site.ts` and the example `articles`, `catalog` and
`sitemaps` routes.

</details>

### See the complete app

```bash
git clone https://github.com/everton-dgn/solidjs_base.git
cd solidjs_base
vp install
vp run build
cd apps/boilerplate
vp run dev
```

Open `http://127.0.0.1:3000/`: the app's `.env` sets that host and port. The
[boilerplate app section](#the-boilerplate-app) lists what it shows.

### Update the packages

Raise both packages in one command. The icons plugin comes with the tooling, at
the same version:

```bash
vp update -L @evertondgn/solid-tooling @evertondgn/solid-runtime
```

`-L` is needed while the packages are `0.x`: a range such as `^0.7.0` stops
below 0.8.0. On 2026-11-17, with vp 1.6.0 and Bun 1.4.4 on macOS, in a copy of
the client-only fixture pinned to 0.7.0, the command rewrote both ranges to
`^0.8.0` and installed the icons plugin 0.8.0 with them:

```text
^ @evertondgn/solid-tooling 0.7.0 -> 0.8.0
^ @evertondgn/solid-runtime 0.7.0 -> 0.8.0
```

Then align the versions the packages were tested with. The runtime and the
tooling declare them as exact peers:

```bash
npm view @evertondgn/solid-runtime peerDependencies
npm view @evertondgn/solid-tooling peerDependencies
```

- Set `solid-js`, `@solidjs/web` and the `@solidjs/signals` and
  `@solidjs/compiler` overrides to the runtime's `@solidjs/web` version.
- Set `vite-plus` to the tooling's version, and the `vite` alias and override to
  the Vite+ core of that version, which has a version of its own: `vp migrate`
  sets both, and `npm view vite-plus@<version> dependencies.vite` prints the
  alias.
- Set `@inlang/paraglide-js` too if your app has translations; that peer is
  optional.

`@solidjs/router` and the `vite` and `vitest` overrides have no peer to read.
The fixtures hold the whole set that CI installs with each version: compare your
manifest with the closest fixture's `package.json` at the tag of the new
version, such as
[client-only at `solid-tooling@0.8.0`](https://github.com/everton-dgn/solidjs_base/blob/solid-tooling@0.8.0/fixtures/apps/client-only/package.json).
The [release notes](https://github.com/everton-dgn/solidjs_base/releases) list
the other breaking changes, such as a new Node version. Do not raise `solid-js`
with `-L`: the newest Solid release can be newer than the one the packages were
tested with.

## See it work

Both runs below used the 0.8.0 packages from npm, on 2026-11-17, in copies of
the [fixtures](#start-a-new-app-from-a-fixture). File paths are shortened.

### A typo in an icon name stops the build

Icons are imported by name, and the name is checked when the app builds and when
it type-checks:

```ts
// src/typo.ts
import { Githb } from 'icon:hugeicons'

export const icon = Githb
```

```text
$ vp build
[plugin vite-plugin-solid-icons] src/typo.ts:1:9
RolldownError: "Githb" is not an icon of 'icon:hugeicons'. Did you mean Github?
1: import { Githb } from 'icon:hugeicons'
            ^

$ vp check
  x typescript(TS2724): '"icon:hugeicons"' has no exported member named 'Githb'. Did you mean 'Github'?
```

The
[icons plugin README](packages/vite-plugin-solid-icons/README.md#build-errors-that-name-the-icon)
lists the other errors that name the icon.

### Every page response gets security headers and a new nonce

The [SSR fixture](fixtures/apps/ssr-plain) passes the runtime's header policy to
`defineSolidApp` and builds. Its production preview answers a page request with
eight security headers and a content security policy whose script nonce changes
on every request. Two lines that come from the fixture and the preview server
are cut from the output:

```text
$ curl -sI http://127.0.0.1:4417/
HTTP/1.1 200
content-security-policy: default-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; script-src 'nonce-2Dq3lGgPyraw4bycVilbMw==' 'strict-dynamic'
content-type: text/html; charset=utf-8
cross-origin-embedder-policy: require-corp
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
permissions-policy: camera=(), microphone=(), geolocation=()
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=63072000; includeSubDomains
x-content-type-options: nosniff
x-frame-options: DENY
```

A second request got another nonce (policy shortened):

```text
content-security-policy: ... script-src 'nonce-+tZMQ1+pW8MBtfSu71btKA==' 'strict-dynamic'
```

Responses that are not HTML get `script-src 'none'`, the development server
sends no CSP, and the static files get three of the headers from the preset. See
[Security headers](packages/solid-runtime/docs/middleware.md#security-headers)
for the middleware policy and the headers of the static files.

## What you get

Each row links to the section of the package that covers it.

| You need                                                                                                                                                                   | Solid Base gives you                                                                                                                                            | From                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [An app config](packages/solid-tooling/README.md#use-the-whole-preset)                                                                                                     | `vite.config.ts` in one call: plugins, build, SSR, lint, formatting, test projects and `vp run` tasks                                                           | `solid-tooling`                                      |
| [Security headers](packages/solid-runtime/README.md#every-response-behind-one-header-policy)                                                                               | Eight security headers on the responses of the middleware, a nonce CSP on the HTML of production builds, and three of the headers on static files               | `solid-runtime`                                      |
| [Private server errors](packages/solid-runtime/README.md#server-failures-stay-on-the-server)                                                                               | A fresh public error in production, with the original message kept on the server                                                                                | `solid-runtime`                                      |
| [Languages](packages/solid-runtime/README.md#links-redirects-and-navigation-that-keep-the-language)                                                                        | Your own locale list, validated catalogs, localized URLs, redirects, cookies and navigation                                                                     | `solid-tooling` and `solid-runtime`                  |
| [A theme](packages/solid-runtime/README.md#the-right-theme-before-hydration)                                                                                               | Light, dark or system, applied before hydration and kept in sync across tabs                                                                                    | `solid-runtime`                                      |
| [SEO](packages/solid-runtime/README.md#head-tags-and-robotstxt-from-route-metadata) and [publication](packages/solid-runtime/README.md#each-page-as-markdown-plus-llmstxt) | Metadata, JSON-LD, robots, Markdown copies of your pages, `llms.txt` and [sitemaps within budgets](packages/solid-runtime/README.md#sitemaps-with-bounded-work) | `solid-runtime`, configured through `solid-tooling`  |
| [Icons](packages/vite-plugin-solid-icons/README.md)                                                                                                                        | Iconify collections and your own SVG folders as typed Solid components, checked by the build                                                                    | `vite-plugin-solid-icons`, loaded by `solid-tooling` |
| [Fonts](packages/solid-runtime/README.md#fonts-with-matching-preloads) and [env](packages/solid-runtime/README.md#environment-values-checked-at-startup)                   | Font CSS with matching preloads, and validated environment values                                                                                               | `solid-tooling` and `solid-runtime`                  |
| [Quality rules](packages/solid-tooling/README.md#lint-rules-that-know-your-project)                                                                                        | Layer rules, backend restrictions, CSS tokens, dead code detection, commit format and a secret scan                                                             | `solid-tooling`                                      |
| [Tests](packages/solid-tooling/docs/testing.md)                                                                                                                            | Node, DOM and browser Vitest projects, and a Playwright config that checks the server log                                                                       | `solid-tooling`                                      |

## Only what you use

| Feature             | How it enters your app                                                    | If you do not need it                                               |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| SSR                 | Enabled by default, with your header policy                               | Set `ssr: false`; no Nitro or server bundle                         |
| Translations        | Add `project.inlang/settings.json`, catalogs and translation dependencies | Omit the project; no generator or translation provider in the build |
| Theme               | Import `theme/define-theme` and connect your Document and UI              | Omit theme imports; no theme modules in the build                   |
| Env validation      | Add `env.ts` and use the validated virtual modules                        | Omit the file; no preset variables become required                  |
| Fonts               | Pass `fonts` to the preset                                                | Omit it; no generated font CSS or assets                            |
| SEO and publication | Import selected runtime entries, install explicit routes and set `seo`    | Omit their imports, routes and preset options                       |

The
[installed application scenarios](docs/ADRs/0021-installed-application-scenarios.md)
check this on real bundles. A case fails when a disabled theme or translation
setup leaves its modules in the bundle, or when a client-only build loads Nitro.
All 14 application cases passed in the CI run of the 0.10.0 release pull request
([job 134474054049](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981/job/134474054049)).
A desktop renderer uses the client-only build; desktop packaging stays in your
application. The tooling still installs the tools of a feature you leave out:
they stay out of the bundle and stay in `node_modules`
([the measured cost](packages/solid-tooling/README.md#fewer-tool-versions-in-each-manifest)).

## Who it fits

- You start SolidJS 2 apps on Vite+ and want the config, lint, tests and hooks
  of the boilerplate_solidjs layout without copying them.
- You maintain several Solid apps and want to fix their base once.
- You want only the
  [lint and format presets](#add-the-packages-to-an-existing-app) in an existing
  Vite+ config.
- You want only the [icons plugin](packages/vite-plugin-solid-icons/README.md)
  in a Vite+ app with SolidJS 2.

## Who it does not fit yet

- Your app needs the full preset with another folder layout, or a server build
  for a host other than Vercel's output format
  ([requirements](#before-you-adopt-it)).
- You cannot pin exact versions. `vite-plus` and `@solidjs/web` are exact peers
  of the packages.
- Install size matters more than fewer declarations
  ([the measured cost](packages/solid-tooling/README.md#fewer-tool-versions-in-each-manifest)).

## Questions before you adopt it

**I do not deploy to Vercel.** The SSR build writes `.vercel/output`, because
the preset always uses Nitro's `vercel` preset. A client-only build
(`ssr: false`) writes a static `dist/` with no server, and the
[no-server guide](docs/tooling/no-server.md) covers static hosts, folders and
app shells. Another SSR host is not supported by the preset today.

**My project has another layout.** Start with the
[lint and format presets](#add-the-packages-to-an-existing-app). They need no
folder layout, but a few rules follow the boilerplate's conventions, such as
`project/test-filename`, which expects each test in `__tests__` next to its
module. You can turn such a rule off in `lint.overrides`. The full
`defineSolidApp` preset, the test presets, Knip and the CSS policy expect the
boilerplate layout
([known limits](packages/solid-tooling/docs/limits.md#known-limits)).

**What happens when a new Solid version ships?** The packages pin Solid, Nitro,
the router and the icons plugin to versions tested together. Wait for a package
version tested with the new release, then
[update the packages](#update-the-packages). Do not raise `solid-js` alone.

**How heavy is the install?** Heavier than the manifest suggests: 8.41% more
`node_modules` with Bun's hoisted linker and 8.69% with the isolated one, in the
measurement recorded in [ADR 0027](docs/ADRs/0027-packaged-tool-dependencies.md)
for a fresh client-only app. The installed scenarios check that none of these
tools reach the app bundles.

**How do I leave?** There is no eject command. Each runtime feature is a
separate import, so you can replace one at a time with your own code. For the
config, the starter's original
[427-line `vite.config.ts`](https://github.com/everton-dgn/boilerplate_solidjs/blob/61454937472d0faa1b4fab985fd7c5da968aa9a6/vite.config.ts)
shows what `defineSolidApp` replaces.

**Can I use only part of it?** Yes for the lint and format presets, and for the
[icons plugin](packages/vite-plugin-solid-icons/README.md) in a Vite+ app with
SolidJS 2. The runtime is built and tested under the tooling preset: 27 of its
64 entries read `virtual:solid-app/*` modules that only `defineSolidApp` serves,
among them `createMiddleware`, the public errors, the language helpers and SEO.
The theme and the security headers read none, but no entry was run without the
preset
([what each entry reads](packages/solid-runtime/docs/entry-points.md#entry-points)).

## The boilerplate app

[`apps/boilerplate`](apps/boilerplate/README.md) is a copy of
boilerplate_solidjs at `6145493` that takes its config, lint, tests and runtime
features from the packages. It is their test bench: CI runs its checks and its
E2E suite on every pull request that touches a package, so a change that breaks
a real app fails before it becomes a version. It is not a template or a UI kit.
To start an app, [copy a fixture](#start-a-new-app-from-a-fixture). Read the app
to see the features wired together:

- Five pages in Portuguese, English and Spanish, with the locale in the URL, a
  language switcher and a theme switcher.
- `robots.txt`, `sitemap.xml`, partitioned `sitemaps/`, `llms.txt` and a
  Markdown copy of each opted-in page.
- One exit for backend HTTP calls, `requestJson`, which the lint enforces.
- Outdated pages that recover after a deploy, code of the app that no package
  ships
  ([recovery guide](apps/boilerplate/docs/server-errors/recovery.md#outdated-page-after-a-deploy)).
- 319 Playwright cases in 15 areas, enumerated with `playwright test --list`. CI
  runs the 164 of the E2E build; the 155 of the production build run locally.

## How it is verified

The counts below come from the CI run of the 0.10.0 release pull request
([run 44206537981](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981)).
Its Packages job ran `vp run validate`, the same checks as the publish job
([job 134474054049](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981/job/134474054049)).

| Suite                             | Result                                                                                                                                                         | Details                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Tooling package                   | 368 `node --test` tests passed in CI, from the 45 test files of the pull request head                                                                          | [Tooling](packages/solid-tooling/README.md#how-it-is-tested)                |
| Runtime package                   | 1,047 Vitest tests in 104 files passed in CI, with 97.46% of statements covered                                                                                | [Runtime](packages/solid-runtime/README.md#how-it-is-tested)                |
| Icons plugin                      | 194 tests in 39 suites passed in CI                                                                                                                            | [Icons plugin](packages/vite-plugin-solid-icons/README.md#how-it-is-tested) |
| Packed tarballs                   | 3 tooling, 6 runtime and 8 icons plugin tests passed in CI                                                                                                     | The same three READMEs                                                      |
| Installed application scenarios   | 14 application cases passed in CI: 3 client-only, 9 SSR and 2 translated SSR, with Bun's `hoisted` and `isolated` linkers; their test file ran 22 tests in all | [Tooling](packages/solid-tooling/README.md#how-it-is-tested)                |
| Release automation                | 164 tests passed in CI                                                                                                                                         | [Releasing](docs/releasing.md)                                              |
| Boilerplate app, Vitest           | 185 tests in 32 files passed in CI ([job](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981/job/134474053995))                              | [App](apps/boilerplate/README.md#how-it-is-tested)                          |
| Boilerplate app, E2E build        | 164 Playwright cases passed in CI ([job](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981/job/134474053917))                               | [App](apps/boilerplate/README.md#how-it-is-tested)                          |
| Boilerplate app, production build | 155 Playwright cases, enumerated with `playwright test --list` and run only locally                                                                            | [App](apps/boilerplate/README.md#how-it-is-tested)                          |

The installed scenarios pack the three packages and install them in the
[fixture apps](fixtures/apps), outside the workspace. A case fails when a
disabled feature leaves its modules in the bundle, when a client-only build
loads Nitro, or when a packaged development tool reaches an emitted module.
Negative probes, run by hand with `SCENARIO_MUTATION`, inject a regression into
a temporary copy and must make their case fail
([ADR 0021](docs/ADRs/0021-installed-application-scenarios.md)). CI picks jobs
by changed paths, so a documentation-only change does not run every suite
([CI coverage](docs/development.md#ci)).

The release workflow publishes through npm trusted publishing, with no stored
npm token. Each version it publishes carries npm provenance (an SLSA v1
provenance statement) that names the commit and the workflow run that built it.
The statement shows where a tarball came from and says nothing about bugs in the
code. The first version of each package was published by hand and has none
([security policy](SECURITY.md)). On 2026-11-17, in a copy of the client-only
fixture with the 0.8.0 packages, `npm audit signatures` checked every installed
package, these three among them:

```text
$ npm audit signatures
314 packages have verified registry signatures

133 packages have verified attestations
(use --json --include-attestations to view attestation details)
```

The attestations of the three 0.8.0 packages name
`.github/workflows/release.yml` on `refs/heads/main` and commit `11626d7`. A new
package follows the [new-package procedure](docs/releasing.md#new-package).

## Documentation and roadmap

The three packages share one version number: a release of one raises the others
to the same version. Each package ships its guides in a `docs/` folder of its
own, so an installed app reads the guides of the version it has
([ADR 0040](docs/ADRs/0040-package-docs-ship-with-the-package.md)).

| Guide                                                                     | What you will find                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Tooling package](packages/solid-tooling/README.md)                       | The preset, its rules, tests and tasks, and its entry points          |
| [Tooling guides](packages/solid-tooling/docs/README.md)                   | Config, lint, tests, Knip, CSS, hooks, fonts and limits, by task      |
| [Runtime package](packages/solid-runtime/README.md)                       | Each production feature and what to import for it                     |
| [Runtime reference](packages/solid-runtime/docs/README.md)                | The API of each feature and the 64 entry points                       |
| [Icons plugin](packages/vite-plugin-solid-icons/README.md)                | Install, setup, the errors that name an icon, options and limits      |
| [Icons plugin reference](packages/vite-plugin-solid-icons/docs/README.md) | Imports, collections, what happens to your SVG files, names and types |
| [Boilerplate app](apps/boilerplate/README.md)                             | The test bench, what each page shows, and its guides                  |
| [Development](docs/development.md)                                        | Workspace setup, tests and CI                                         |
| [Architecture](docs/architecture.md)                                      | Package boundaries and application ownership                          |
| [Releasing](docs/releasing.md)                                            | Versions, publishing and recovery                                     |
| [ADRs](docs/ADRs/README.md)                                               | Decisions and measured tradeoffs                                      |

The [documentation index](docs/README.md) maps each task to its page. Read the
[contributing guide](CONTRIBUTING.md) before opening an issue or pull request,
and report security problems privately as [SECURITY.md](SECURITY.md) explains.

### Roadmap

The work below is planned, with no version or date set yet.

| Planned work                      | Scope                               |
| --------------------------------- | ----------------------------------- |
| Reusable CI and release workflows | Shared automation for applications  |
| `vp create` template              | New applications using the packages |

## License

[MIT](LICENSE)
