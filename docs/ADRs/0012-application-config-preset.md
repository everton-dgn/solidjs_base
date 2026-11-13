# 0012. A preset builds the application Vite config

- Status: Accepted
- Date: 2026-11-13

## Context

After [ADR 0011](0011-test-configs-in-the-tooling-package.md), the
`vite.config.ts` of the boilerplate copy still had 334 lines: the Solid,
routing, icons and Nitro plugins inside `lazyPlugins`, the security headers of
the static files as Nitro route rules, the build, CSS, server and preview
blocks, and seven `vp run` tasks. Every application built from
boilerplate_solidjs carries the same lines.

Some constraints shape what a package can take:

- `vp lint`, `vp fmt` and `vp check` load `vite.config.ts`. A plugin imported at
  the top of a module is loaded by every one of them; inside `lazyPlugins`, it
  is skipped while Vite+ only reads the config.
- The Solid plugin refuses a `start.middleware` outside the Vite root, so the
  middleware path stays in the application.
- Bun reads `overrides` and `patchedDependencies` only from the root
  `package.json`, so the application keeps the plugin packages as direct
  dependencies.
- Knip reads the commands of `run.tasks` from the syntax tree of
  `vite.config.ts`. Tasks defined in a package are invisible to it.
- Nitro compiles route rules with the `preMerge` of h3, which refuses rules that
  overlap in part.

The change was checked against the config it replaced, in the monorepo and in a
copy outside the workspace with the package installed from its tarball:

| Comparison                                                                                                                                           | Result                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Resolved config in five modes, with and without `CI`: tasks, build, CSS, `resolve`, server, preview, plugin order per target, options of each plugin | Same, except the icon folder, now an absolute path from `root` instead of a path relative to the cwd |
| `.vercel/output/config.json` of the production and `e2e` builds                                                                                      | Same                                                                                                 |
| Files in `.vercel/output/static`                                                                                                                     | Same, except three hashed chunks that also change between two builds of the same source              |
| Status, headers and body of 11 requests to the dev server and to the preview                                                                         | Same                                                                                                 |
| Check, Node type check, Knip, Vitest, tooling tests, build and the `e2e` end-to-end suite                                                            | Pass in the monorepo and in the tarball copy                                                         |
| Production end-to-end suite (headers and CSP)                                                                                                        | Passes in the monorepo                                                                               |

## Decision

`./vite` exports `defineSolidApp(options)`, which returns the whole Vite+ config
of an application, built with `defineConfig`.

- The application passes what is its own: `root`, the middleware and server
  setup paths, the `e2e` paths, its icon collections, the values of the static
  security headers, its `publicAssets` and other static paths, extra route rules
  and tasks, and the `workspace` inputs when it lives in a monorepo.
- Code that has not moved to a package yet comes in through `extend`, called
  inside `lazyPlugins` on every load of the config: once for the application and
  once per test project. One call returns both the plugins and the Nitro
  modules, so a build id shared by the two stays the same.
- The preset fixes the rest: the plugin order, Nitro with the `vercel` preset,
  the static file rules (with the locales read from
  `project.inlang/settings.json`), the build, CSS, `resolve`, server and preview
  blocks, the seven tasks, and `lint`, `fmt` and `test` from the other presets.
- The plugin packages are imported with `import()` inside the `lazyPlugins`
  factory. `@solidjs/vite-plugin`, `nitro`, `filesystem-routing` and
  `unplugin-icons` are optional peer dependencies, pinned like the others
  ([ADR 0002](0002-compiled-tooling-package.md)).
- `defineSolidApp` throws on a `publicAssets` entry without a usable `baseURL`
  and on a static path without a leading slash. Loading the plugins fails when a
  static path sits inside a locale folder, where it would overlap the Markdown
  rule of that locale.

### What differs from the plan

The extraction plan listed `defineSolidApp({ site, locales, security, seo })`
and an application config of about 20 lines.

- `site` is not an option. The config never read the site URL: it comes from
  `VITE_SITE_URL`, changes per deploy and stays in the environment.
- `locales` is not an option. `project.inlang/settings.json` is already their
  single source, and the preset reads it.
- `security` is the `securityHeaders` option until the runtime package ships the
  header values, and SEO comes in through `extend` until the publication code
  moves to a package.
- The copy has 48 lines at this step, not about 20. The rest leaves with the
  runtime, i18n and SEO steps of the [roadmap](../../README.md#roadmap).

## Consequences

- The `vite.config.ts` of the copy went from 334 to 48 lines.
- Knip no longer sees the task commands, so the copy lists
  `tooling/i18n/generate.ts` and `tooling/css/check.ts` as entries. Knip counts
  the peer dependencies of the package as used, so the plugin packages without
  an import in the application are not reported.
- The default tasks run scripts from the `tooling/` folder of the boilerplate.
  An application without them replaces the tasks through `tasks`.
- Only the copy in the monorepo passes `workspace`. A copy outside the workspace
  leaves it out.
- A new version of Solid, Nitro, the router or the icons plugin needs a package
  version tested with it.
- The modules that `extend` imports from the application are still bundled with
  the config by every command, as before.
- The tarball test checks that the files of `./vite` exist, not that it loads
  from an installed package, as with `./vitest` in
  [ADR 0011](0011-test-configs-in-the-tooling-package.md). A copy of the
  application installed from the tarball covers that before a release.
