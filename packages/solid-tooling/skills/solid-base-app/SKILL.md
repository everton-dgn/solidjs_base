---
name: solid-base-app
description: Rules for an application built with @evertondgn/solid-tooling. Use when editing vite.config.ts or the options of defineSolidApp, turning SSR, translations and Paraglide, icons, fonts, SEO publication or Solid diagnostics on or off, choosing between a vp run task and a built-in vp command, naming or placing a test, fixing an error of the lint preset, adding a dependency, changing the tsconfig, Knip, the CSS lint, commitlint or the Git hooks, or running vp run doctor or vp run agents.
---

# Solid Base application

`defineSolidApp` from `@evertondgn/solid-tooling/vite` returns the whole
`vite.config.ts`: plugins, `vp run` tasks, lint, format and tests. Each feature
is on only when the application uses it, so check its switch before adding a
plugin or a dependency. `vp run doctor` lists the installed versions, the skills
to read and the commands that validate a change.

## Features of defineSolidApp

- SSR is the default and requires `securityHeaders`. `ssr: false` builds a
  client-only application, with no Nitro and no server functions, and throws on
  a server option such as `seo`, `middleware`, `serverSetup` or `staticPaths`.
- `project.inlang/settings.json` turns translations on: the catalog validator,
  the Paraglide plugin, the `i18n-generate` task and the test setup. Without it
  there is one locale, `language` (`en`). The Paraglide lint rule follows
  `@inlang/paraglide-js` resolving from the application.
- With translations, `project.inlang/paraglide.config.ts` spreads
  `defineParaglideConfig(settings.locales)` from
  `@evertondgn/solid-tooling/paraglide` to change one option. Each folder of
  `src/**/i18n/<locale>.json` has every locale, the same owner-prefixed IDs,
  such as `home_title`, and compatible parameters.
- The application then declares `@inlang/paraglide-js` at the peer version and
  `@inlang/plugin-message-format`. `i18nPlugin: false` turns off only the
  automatic plugins: generate the modules before the commands that read them.
- `icons` maps a collection name to a folder of SVG files; installed
  `@iconify-json/*` packages load by name. `fonts` takes data only; with SSR,
  render `FontLinks` once in the Document head.
- `seo` is SSR data: `robots`, `sitemap`, `markdown`, `llms` and `llmsFull`,
  each off when omitted, with the origin in `VITE_SITE_URL` or the key of
  `originEnv`. `llmsFull` needs `llms` and `markdown: { static: true }`.
- Diagnostics run at `/__solid/diagnostics` in development when the application
  declares `@solidjs/diagnostics`; `diagnostics: false` turns them off.
- `extend` returns new plugin instances on each call, with no side effects, for
  plugins the application owns; translations and publication need none. `tasks`
  adds or replaces a task by name.

## Tasks and commands

- `vp lint`, `vp fmt` and `vp check` are Vite+ commands that read the `lint` and
  `fmt` blocks. The `check-project` and `lint-project` tasks run `lint-css` and
  `icons-generate` first, so with icons run `vp run icons-generate` before a
  bare `vp lint` or `vp run tsrs`.
- `typecheck-node` checks `tsconfig.node.json`, `dead-code-project` runs Knip
  and then Knip `--strict`, `test-tooling` runs `node --test` over
  `tooling/**/__tests__` except `tooling/release/`, and `i18n-generate`
  validates the catalogs before compiling `paraglide/`.
- Run the packaged binaries as `vp run knip`, `vp run tsrs`,
  `vp run playwright`, `vp run lefthook` and `vp run commitlint`: they are not
  in `node_modules/.bin`. Knip and the CSS lint run in Bun, the others in Node.
- The package supplies its tools at the tested versions. The application
  declares only what its own source imports, at the versions of the package,
  plus `vite-plus` and `vite`; a tool it only runs stays in the package.

## Tests

- A test sits in `__tests__` next to its module and takes the folder name plus
  the environment: `Button/__tests__/Button.dom.test.tsx`, or with a qualifier,
  `Button.focus.dom.test.tsx`. Type tests end in `.test-d.ts`.
- `.node.test` runs in Node, with stand-ins for `server-only`,
  `virtual:file-routes` and the server function handler. `.dom.test` runs in
  happy-dom at `domUrl`, which is `/<baseLocale>` with Paraglide.
  `.browser.test` runs in Chromium with the CSS loaded.
- End-to-end tests live in `src/tests/pages/<Page>/`, named after the page, and
  run with `vp run playwright test`. Scripts in `tooling/` use `node:test` and
  `Name.test.ts`.

## Lint rules that reject code

- Warnings fail the run, an unused disable directive is an error, and the lint
  type-checks the files it reads.
- `project/*`: a CSS Module is imported as `S` from `styles.module.css`, exports
  sit on the declaration instead of `export { a }`, a test follows the names
  above, and a route `seo.ts` exports only `seo`.
- `backend/*`, in `src/`: no `console`, no `fetch` outside
  `src/infra/server/requestJson/index.ts`, no Node transports, no
  `markSafeError`, no `node_modules` path in an import and at most three `../`.
  The server-error configurator belongs only to
  `src/infra/server/configureServerErrors/index.ts`, which exports nothing.
- `architecture/layer-imports`: `@types`, `constants`, `helpers`, `data`,
  `infra`, `theme`, `i18n` and `paraglide/` do not import primitives,
  components, routes or entry files; atoms do not import molecules or organisms,
  molecules do not import organisms, and production code imports no test and
  nothing from `tooling/`.
- The rules read import specifiers as text, so a computed `import()` escapes
  them; do not use one to get around a rule. Turn a rule off for some files in
  `lint.overrides`, spreading the existing entries, and never replace
  `lint.jsPlugins`.

## Guides

- [Tooling guides](../../docs/README.md): the task index of the guides.
- [Application config](../../docs/app-config.md): `defineSolidApp`, its options,
  tasks, SEO, environment and diagnostics.
- [Lint](../../docs/lint.md): the expected layout and each rule of the preset.
- [Testing](../../docs/testing.md): the Vitest projects and Playwright.
- [Fonts](../../docs/fonts.md): the `fonts` option and `FontLinks`.
- [Knip and CSS](../../docs/knip-and-css.md): unused code and the CSS lint.
- [TypeScript and format](../../docs/typescript-and-format.md): the tsconfigs
  and the formatter.
- [Commits and hooks](../../docs/commits-and-hooks.md): commitlint and Lefthook.
- [Limits](../../docs/limits.md): dependencies, packaged commands and known
  limits.
