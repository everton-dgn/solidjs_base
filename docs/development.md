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

- `packages/*`: the packages published to npm.
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

| Command               | What it does                                                   |
| --------------------- | -------------------------------------------------------------- |
| `vp run build`        | Compile the packages to `dist/`                                |
| `vp run check`        | Check format, lint and types of the packages                   |
| `vp run test`         | Run the rule tests with `node:test`                            |
| `vp run test:tarball` | Pack the package, install it in a copy of the fixture, lint it |
| `vp run validate`     | Build, check, rule tests and tarball test, in this order       |

The rule tests that go through the Oxlint CLI load the plugins from `dist/`, so
`vp run test` builds the package first.

The root `vite.config.ts` lints the package sources with the same preset,
loading the plugins from `src/` instead of `dist/`, so a change to a rule is
checked on the next run without a build. The package sources get the exceptions
the preset gives to an application's `tooling/` folder.

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
compiled presets from `dist/`. Run `vp run build` at the root first, and again
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
  `vp run` tasks come from the package. The i18n plugin and the publication
  artifacts still come from `tooling/`, through the `extend` option. The
  `workspace` option points `bun.lock`, `bunfig.toml` and the package build to
  the monorepo root; a copy outside the workspace leaves it out.
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
- `tooling/knip.ts` excludes the `catalogReferences` check: Knip runs in the
  application folder and does not see the root catalog. `bun install` already
  fails on a catalog entry that does not exist.
- `docs/` and `AGENTS.md` point the rule paths to `packages/solid-tooling/src/`
  and are in English
  ([ADR 0014](ADRs/0014-boilerplate-copy-docs-in-english.md)). Their sections
  about releases, CI, Git hooks and the Vercel deploy describe the original
  repository.

### Updating the copy

The copy does not follow boilerplate_solidjs on its own. To bring it up to date,
take the new commit of the original, apply it over `apps/boilerplate` and keep
the changes listed above. The guides of the original are in Portuguese:
translate the parts the new commit changes, and keep the headings in step with
the links that point to them. Then run the commands of the table and record the
new commit in this section and in `apps/boilerplate/AGENTS.md`.

## CI

`.github/workflows/ci.yml` runs on pull requests, on pushes to `main` and by
hand. On a pull request, the `Changes` job reads the list of changed files and
starts only the jobs those files affect. Pushes to `main` and manual runs start
every job.

| Changed files                                                                                      | Jobs                                           |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Only Markdown, `docs/`, `LICENSE`, issue templates, `.coderabbit.yaml` or `.github/dependabot.yml` | Docs                                           |
| Only `apps/boilerplate/`                                                                           | Boilerplate app, Boilerplate app E2E           |
| Anything else: packages, fixtures, root config, lockfile, workflows                                | Packages, Boilerplate app, Boilerplate app E2E |

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
