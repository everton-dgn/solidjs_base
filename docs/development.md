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

`apps/boilerplate` is a copy of boilerplate_solidjs, taken at commit `31de7bf`.
It uses `@evertondgn/solid-tooling` from the workspace in place of its own lint
rules, formatter settings and TypeScript base, and runs the full suites of the
original. A change to a package that breaks the application fails here, before
it becomes a version.
[ADR 0009](decisions/0009-boilerplate-app-in-the-monorepo.md) explains why the
copy exists.

Run its commands from `apps/boilerplate`:

| Command                 | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `vp run check:ci`       | Format check, lint with type checking, and the CSS lint                  |
| `vp run typecheck:node` | Type check `vite.config.ts` and `tooling/`                               |
| `vp run dead-code`      | Find unused files, exports and dependencies with Knip                    |
| `vp run test:ci`        | Vitest with coverage: node, dom and browser projects                     |
| `vp run test:tooling`   | Tests of the application tooling: i18n, Markdown, CSS, Playwright config |
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
- `tooling/css/__tests__/cssPolicy.test.ts` lost the cases for the CSS filename
  and CSS Modules rules, which are now tested in the package.
- `tooling/__tests__/playwright.test.ts` lost the two cases that read the CI
  workflow of the original repository.
- `tooling/__tests__/patched-dependencies.test.ts` reads the root `package.json`
  and `bun.lock`.
- `tooling/knip.ts` skips the `catalogReferences` check: Knip runs in the
  application folder and does not see the root catalog. `bun install` already
  fails on a catalog entry that does not exist.
- `docs/` and `AGENTS.md` point the rule paths to `packages/solid-tooling/src/`.
  Their sections about releases, CI, Git hooks and the Vercel deploy describe
  the original repository.

### Updating the copy

The copy does not follow boilerplate_solidjs on its own. To bring it up to date,
take the new commit of the original, apply it over `apps/boilerplate` and keep
the changes listed above. Then run the commands of the table and record the new
commit in this section and in `apps/boilerplate/AGENTS.md`.

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:

- **Packages**: `vp run validate`, the same command as the publish job.
- **Boilerplate app**: `vp run build` at the root, then the commands of the
  table above, in that order.

The browser and end-to-end tests use the Chrome installed on the GitHub runner,
as in the original repository.

CodeRabbit reviews at most 100 files per pull request. `.coderabbit.yaml` leaves
out the files of `apps/boilerplate` copied unchanged from the original, so an
update of the copy stays under that limit. Codex has no such filter: it reviews
every file when a pull request is opened or marked ready for review, or when
someone comments `@codex review`.

`.github/workflows/release.yml` versions and publishes the packages. See
[Releasing](releasing.md).
