# Development

## Setup

Install the global [Vite+](https://viteplus.dev/guide/) CLI (`vp`). The root
`package.json` sets the Bun version (`packageManager`) and the Node version
(`devEngines`), and `vp` uses them.

```bash
vp install
vp run build
```

`vp run build` compiles `@evertondgn/solid-tooling` to `dist/`. The application
in `apps/boilerplate` imports the package from there, so build it before running
anything in the application.

## Workspace

The root `package.json` lists two workspace folders:

- `packages/*`: the packages published to npm. `@evertondgn/solid-runtime` stays
  private until its first publish.
- `apps/*`: applications that use the packages through the workspace. They are
  never published.

`fixtures/consumer` is outside the workspace on purpose. The tarball test copies
it to a temporary folder and installs the packed package there, the way an
application installs it from npm.

Bun reads `catalog`, `overrides` and `patchedDependencies` only from the root
`package.json`. The versions and patches that `apps/boilerplate` needs are kept
there, and the patch files stay in `apps/boilerplate/patches/`.

## Package commands

Run them from the root. The scripts select `./packages/*` only, because the
publish job runs `vp run validate` and must not run the application suites.

| Command               | What it does                                                                          |
| --------------------- | ------------------------------------------------------------------------------------- |
| `vp run build`        | Compile the packages to `dist/`                                                       |
| `vp run check`        | Check format, lint and types at the root, then lint the runtime package in its folder |
| `vp run dead-code`    | Find unused files, exports and dependencies of the runtime package with Knip          |
| `vp run test`         | Run the rule tests with `node:test` and the runtime tests                             |
| `vp run test:tarball` | Pack each package and install it in a temporary folder                                |
| `vp run validate`     | Build, check, dead code, package tests and tarball tests, in this order               |

The rule tests that go through the Oxlint CLI load the plugins from `dist/`, so
`vp run test` builds the package first. The runtime tests run in the Vitest of
`packages/solid-runtime` (`vp test run --coverage` in that folder), with the
stand-ins and the coverage thresholds that `solidTest` gives to an application.
The runtime package has no build, so the filtered `build` skips it, and the
tooling package has no `check` or `dead-code` script, so those skip it.

The root `vite.config.ts` lints the tooling sources with the same preset,
loading the plugins from `src/` instead of `dist/`, so a change to a rule is
checked on the next run without a build. The tooling sources get the overrides
the preset writes for an application's `tooling/` folder.

The runtime package runs its own checks
([ADR 0020](ADRs/0020-runtime-package-checks-in-its-own-folder.md)). Its `check`
script runs `vp lint` in `packages/solid-runtime`, whose `vite.config.ts` loads
the same preset from the sources. From that folder its `src/` is the `src/` of
an application, so the backend policy, the test exceptions, the architecture
rule and the other rules that read paths apply as they do in an application, and
the type check reads `packages/solid-runtime/tsconfig.json`. The root lint
ignores the package, so each file is linted once. The script is not `vp check`,
which in a workspace package uses the `lint` and `fmt` blocks of the root. The
formatter stays at the root, which covers the package. The `dead-code` script
runs Knip in the default and `--strict` modes; Knip reads the entries from the
`exports` of the package. The tarball test packs the package, extracts it to the
`node_modules` of a temporary folder and checks that the header constants load
in Node, that every target of `exports` is in the tarball and that no
`__tests__` folder is published.

## The boilerplate app

`apps/boilerplate` is a copy of boilerplate_solidjs, taken at commit `6145493`.
It uses `@evertondgn/solid-tooling` from the workspace in place of its own lint
rules, formatter settings and TypeScript base, and runs the full suites of the
original. A change to a package that breaks the application fails here, before
it becomes a version. [ADR 0009](ADRs/0009-boilerplate-app-in-the-monorepo.md)
explains why the copy exists.

Run its commands from `apps/boilerplate`:

| Command                 | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `vp run check:ci`       | Format check, lint with type checking, and the CSS lint                  |
| `vp run typecheck:node` | Type check `vite.config.ts` and `tooling/`                               |
| `vp run dead-code`      | Find unused files, exports and dependencies with Knip                    |
| `vp run test:ci`        | Vitest with coverage: node, dom and browser projects                     |
| `vp run test:tooling`   | Tests of the application tooling: i18n, Markdown, CSS Module class names |
| `vp run build`          | Build the application                                                    |
| `vp run test:e2e`       | Playwright end-to-end tests                                              |

Every command loads the application's `vite.config.ts`, which imports the
compiled presets from `dist/` and the security header constants from
`@evertondgn/solid-runtime`. Run `vp run build` at the root first, and again
after changing the package. Once `dist/` exists, `check:ci`, `typecheck:node`
and `dead-code` rebuild the package before they run.

In a Vite+ monorepo, `vp check` always uses the `lint` and `fmt` blocks of the
root `vite.config.ts`. The root config ignores `apps/`, and the application runs
`vp fmt --check` and `vp lint`, which read the config of the folder they run in.

### What changed from the original

- Left out: the rules that moved to the package, the release automation
  (`tooling/release/`), the CI reuse proof (`tooling/ciReuse/`), `.github/`, Git
  hooks, commitlint and the project changelog.
- `vite.config.ts`, `tsconfig.json`, `tooling/css/check.ts` and
  `tooling/testing/lintFixture/` import from the package.
- The Vitest projects, the Playwright config (`playwright.config.ts`, in place
  of `tooling/playwright.ts`), the browser test setup, the test stand-ins of
  `tooling/testing/` and the server log teardown come from the package, with
  their tests. `tsconfig.json` extends `tsconfig.app.json` and keeps only the
  `paths`.
- `vite.config.ts` calls `defineSolidApp` from `./vite`: the plugins, the
  headers of the static files, the build, CSS, server and preview blocks and the
  `vp run` tasks come from the package, with `publication: true` for the headers
  of the published files. The i18n plugin and the publication artifacts still
  come from `tooling/`, through the `extend` option. The `workspace` option
  points `bun.lock`, `bunfig.toml` and the package build to the monorepo root; a
  copy outside the workspace leaves it out.
- `tooling/knip.ts` and `tooling/css/check.ts` call `defineKnipConfig` and
  `checkCss` from the package and pass only what is the application's own: the
  public API entries, the fixture middleware and the ignores below. The
  Stylelint config, the CSS policy tests and the `stylelint` and
  `stylelint-use-nesting` dependencies moved to the package, and the CSS lint
  messages are in English.
- `tooling/knip.ts` lists `tooling/i18n/generate.ts` and `tooling/css/check.ts`
  as entries. Knip reads task commands only from a `run.tasks` block written in
  `vite.config.ts`, and the tasks now come from the package.
- `tooling/knip.ts` lists `server-only` in `ignoreDependencies`: the original
  resolved it through a test alias to `tooling/testing/server-only.ts`.
- `tooling/__tests__/patched-dependencies.test.ts` reads the root `package.json`
  and `bun.lock`.
- The middleware steps `securityHeaders` (with its constants),
  `restrictPageMethods`, `requestClassification`, `negotiatePageFormat` and
  `isHtmlResponse`, and the `Middleware` and `Next` types, moved to
  `@evertondgn/solid-runtime` with their tests, and `apiRoutes` from the package
  replaces the `createAPIHandler(routes)` call of `src/middleware/index.ts`. The
  locale, Markdown and failure steps and the chain stay in `src/middleware/` and
  import the moved steps by package specifier
  ([ADR 0018](ADRs/0018-runtime-package-middleware.md)).
- `src/middleware/securityHeaders/constants.ts` holds the header values and the
  CSP directives of the copy, spread from the package defaults, and
  `src/middleware/securityHeaders/index.ts` holds the only
  `createSecurityHeaders` call. The chain, the failure containment, the locale
  step, the uncached Markdown responses and `vite.config.ts` read from that
  folder; `requestNonce` comes from the package
  ([ADR 0019](ADRs/0019-runtime-security-headers-options.md)).
- `src/constants/http.ts` lost `HTTP_METHOD_NOT_ALLOWED`, used only by
  `restrictPageMethods`, and `tooling/knip.ts` lost the ignore of the moved
  `securityHeaders` test. The `workspace` option of `vite.config.ts` lists
  `packages/solid-runtime/src/**` and the package manifest, whose `exports`
  resolve each import, as inputs of the cached tasks. Without them, only the
  lint noticed a change in the package, through the automatic tracking; the Node
  type check replayed its cached result after a change in the header types that
  `vite.config.ts` reads.
- `tooling/knip.ts` excludes the `catalogReferences` check: Knip runs in the
  application folder and does not see the root catalog. `bun install` already
  fails on a catalog entry that does not exist.
- `docs/` and `AGENTS.md` point the rule paths to `packages/solid-tooling/src/`
  and the moved middleware files to `packages/solid-runtime/src/`, and are in
  English ([ADR 0014](ADRs/0014-boilerplate-copy-docs-in-english.md)). Their
  sections about releases, CI, Git hooks and the Vercel deploy describe the
  original repository.

### Updating the copy

The copy does not follow boilerplate_solidjs on its own. To bring it up to date,
take the new commit of the original, apply it over `apps/boilerplate` and keep
the changes listed above. The guides of the original are in Portuguese:
translate the parts the new commit changes, and keep the headings in step with
the links that point to them. Then run the commands of the table and record the
new commit in this guide, in `apps/boilerplate/README.md`, in
`apps/boilerplate/AGENTS.md` and in the links of the guides that point to files
of the original at the copied commit.

## README figures

The figures of the two READMEs are the `.webp` files in `docs/assets/readme/`,
one per theme. Their source is `docs/assets/readme/figures.html`, a page with
the six figures drawn in HTML and CSS from the real code, numbers and command
output. Open it with `?figure=<id>&theme=<dark|light>` to see one figure, where
`<id>` is the `id` of its section, or without parameters to see them all.

To export a figure, take a screenshot of its section in a headless browser with
an 800 px wide viewport, a device scale factor of 2 and a transparent
background, and convert it to WebP. The fonts load from Google Fonts, so the
export needs network access.

The figures repeat numbers that the READMEs state as text, such as the line
counts of the before and after table. When one of those numbers changes, change
it in `figures.html` too and export the figure again.

## CI

`.github/workflows/ci.yml` runs on pull requests, on pushes to `main` and by
hand. The `Changes` job reads the list of changed files and starts only the jobs
those files affect. A push to `main` that merges an up-to-date pull request with
a passed `CI required` starts no job, because the pull request run checked the
same tree ([ADR 0017](ADRs/0017-main-reuses-the-pull-request-run.md)). Manual
runs start every job.

| Changed files                                                            | Jobs                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------- |
| Only Markdown, `docs/`, `LICENSE`, issue templates or `.coderabbit.yaml` | Docs                                           |
| Only `apps/boilerplate/`                                                 | Boilerplate app, Boilerplate app E2E           |
| Anything else: packages, fixtures, root config, lockfile, workflows      | Packages, Boilerplate app, Boilerplate app E2E |

A pull request that touches more than one group runs the jobs of each.

| Job                 | What it runs                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Docs                | `vp fmt --check`, and an offline link check (lychee) over the Markdown of the repository, anchors included |
| Packages            | `vp run validate`, the same command as the publish job                                                     |
| Boilerplate app     | `vp run build` at the root, then check, Node type check, dead code, tests with coverage and tooling tests  |
| Boilerplate app E2E | `vp run build` at the root, then the application build and the end-to-end tests                            |
| CI required         | Fails when any job above failed or was cancelled                                                           |

`CI required` is the only check the `main` ruleset requires. A job skipped by
its `if`
[reports success](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions),
so a skipped job never blocks a merge, and a new job only needs to be added to
the `needs` of `CI required`.
[ADR 0010](ADRs/0010-ci-runs-what-a-change-affects.md) explains the choices.

The browser and end-to-end tests use the Chrome installed on the GitHub runner,
as in the original repository.

CodeRabbit reviews at most 100 files per pull request. `.coderabbit.yaml` leaves
out the files of `apps/boilerplate` copied unchanged from the original, so an
update of the copy stays under that limit. Codex has no such filter: it reviews
every file when a pull request is opened or marked ready for review, or when
someone comments `@codex review`.

`.github/workflows/release.yml` versions and publishes the packages. See
[Releasing](releasing.md).
