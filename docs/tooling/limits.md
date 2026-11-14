# Requirements, limits and versions

[Tooling reference](README.md)

## Requirements

The application installs two packages next to this one:

| Package      | Why                                                      |
| ------------ | -------------------------------------------------------- |
| `vite-plus`  | Runs lint and format, and provides the Oxlint plugin API |
| `typescript` | The preset turns on type-aware linting and type checking |

`vite-plus` is a peer dependency, pinned to the exact version the package is
tested with. Install the version listed in its `peerDependencies`. `typescript`
is not a peer dependency: the package is tested with the version in its
`devDependencies`.

An application with translations also installs `@inlang/paraglide-js`, an
optional peer dependency pinned the same way. The lint preset then registers its
plugin.

`eslint-plugin-solid`, `stylelint` and `stylelint-use-nesting` come with the
package, so the application does not declare them.

Some entries need tools the application already runs:

| Entry            | The application installs                                                        |
| ---------------- | ------------------------------------------------------------------------------- |
| `./vitest`       | `@vitest/browser-playwright`, `@vitest/coverage-v8`, `happy-dom`, `playwright`  |
| `./playwright`   | `@playwright/test`, an optional peer dependency pinned like the others          |
| `./knip`         | `knip` and `filesystem-routing`, optional peer dependencies pinned the same way |
| `./commitlint`   | `@commitlint/cli`, an optional peer dependency pinned the same way              |
| `./lefthook.yml` | `lefthook`, an optional peer dependency pinned the same way                     |

`./vite` also needs the test tools of `./vitest`, and loads four plugin
packages: `@solidjs/vite-plugin`, `nitro`, `filesystem-routing` and
`unplugin-icons`. They are optional peer dependencies pinned like the others.
Install the versions listed in `peerDependencies` as direct dependencies of the
application: Bun applies `overrides` and `patchedDependencies` only from the
root `package.json`, and the Knip plugin of `unplugin-icons` only turns on with
a direct dependency.

## Install

`vp` is the Vite+ CLI. An application built with Vite+ already has `vite-plus`
and `typescript`, so it only adds this package:

```bash
vp add -D @evertondgn/solid-tooling
```

An application with translations and without `@inlang/paraglide-js` adds it too,
in the version the package asks for:

```bash
npm view @evertondgn/solid-tooling peerDependencies
vp add -D @inlang/paraglide-js@<version>
```

## Known limits

- The package ships compiled JavaScript. Node refuses to run TypeScript from
  `node_modules`, and Vite+ loads `vite.config.ts` in Node.
- `project/test-filename` has no options. Test folders without a module, such as
  the page tests in `src/tests/pages/`, are listed inside the package with the
  names used in boilerplate_solidjs. For any other folder of that kind, turn the
  rule off in `lint.overrides`, as shown in
  [Changing the preset](lint.md#changing-the-preset).
- Some rule messages point to `docs/architecture.md` and `AGENTS.md`. Those
  files belong to the application created from boilerplate_solidjs.
- The test presets expect the boilerplate layout: tests named by suffix
  (`.node.test`, `.dom.test`, `.browser.test`, `.e2e.test`), page tests in
  `src/tests/pages/`, Paraglide output in `paraglide/` and `.env.test` at the
  root. With Paraglide, the `dom` project starts at `/<baseLocale>`, which fits
  `urlPatterns` that prefix every locale; `domUrl` sets another URL.
- The Knip and CSS configs expect the same layout: pages in `src/routes/`,
  fixture routes in `src/tests/fixtures/` and the theme in `src/theme/`.
- The Knip config ignores every unlisted dependency in its own file, not only
  this package.
- `./vite` expects the same layout: its tasks run scripts in `tooling/`, and the
  Markdown rules need the locale prefix of the Paraglide `urlPatterns` in every
  URL. Nitro always uses the `vercel` preset. The plugin packages are pinned, so
  a new version of Solid, Nitro, the router or the icons plugin needs a package
  version tested with it.

## Versions

The package follows semantic versioning. Below 1.0.0, a breaking change raises
the minor version. Each release is listed in the
[changelog](../../packages/solid-tooling/CHANGELOG.md).

## License

MIT
