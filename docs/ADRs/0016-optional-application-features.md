# 0016. The application presets turn on only the features the application uses

- Status: Accepted
- Date: 2026-11-13

## Context

[ADR 0012](0012-application-config-preset.md) built `defineSolidApp` from the
boilerplate, which uses every feature. The presets assumed all of them:

- `defineSolidApp` always turned on SSR, server functions and Nitro, and failed
  without `project.inlang/settings.json`.
- It always wrote header rules for the sitemap, `llms.txt` and the Markdown
  pages, even for an application that publishes none of them.
- It always registered the `i18n-generate` task.
- The lint preset always registered the Paraglide plugin, so an application
  without translations had to install `@inlang/paraglide-js` to lint.
- The browser test setup imported the Paraglide runtime.

An application built on these packages may skip SSR, translations, the sitemap,
`llms.txt` and the Markdown pages. An Electron renderer or a static site is a
valid consumer, and code or build steps it does not use must not reach its
production output.

## Decision

- `ssr: false` builds a client-only application: the Solid plugin in client
  mode, the routes and the icons, without Nitro, server functions or route
  rules. The options that need SSR are refused in that mode, by the types and
  with an error at runtime.
- The rules for the published files need `publication: true`. The locales are
  read only then, and an application without `project.inlang/settings.json`
  publishes no locale folder instead of failing.
- `project.inlang/settings.json` decides the `i18n-generate` task and the
  Paraglide setup and alias of the browser test project.
- The lint preset registers the Paraglide plugin and its rule only when
  `@inlang/paraglide-js/eslint` resolves from the folder where lint runs, where
  Oxlint loads it. `@inlang/paraglide-js` becomes an optional peer dependency.
- `securityHeaders` stays required with SSR.

## Consequences

- The boilerplate copy sets `publication: true`. Its production build has the
  same `.vercel/output/config.json` as before, the same file list, and every
  suite passes. With `publication` off, the production E2E reports the missing
  headers of the static files, so the option is guarded.
- A client-only application installed from the tarball built `dist/` with one
  page and one 29 KB script, with no server folder and no Paraglide, Nitro or
  Vercel string. The page mounted in headless Chromium, and its browser test
  project ran without the Paraglide setup.
- The consumer fixture of the tarball test no longer installs Paraglide, so that
  test also checks that lint runs and the package rules fire without it.
- An application that relied on the default header rules of the published files
  has to set `publication: true`. Before 1.0.0 this is a minor version.
- Nitro still uses the `vercel` preset, and the runtime package must follow the
  same rule: each feature behind its own entry, and a middleware chain that
  receives the locale and Markdown steps instead of importing them.
