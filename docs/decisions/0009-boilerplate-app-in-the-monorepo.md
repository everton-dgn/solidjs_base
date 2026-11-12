# 0009. A copy of the boilerplate runs in the monorepo

- Status: Accepted
- Date: 2026-11-12

## Context

Before this decision, the package was tested by its rule tests and by
`fixtures/consumer`, a small application with seven source files.
boilerplate_solidjs has about 46,000 lines in `src`, `tooling`, the i18n project
and `public`, and a merge on its `main` deploys to production. Changing the
boilerplate to test the package would put that deploy at risk.

The options were a copy of the boilerplate in this repository, moving the
development of the boilerplate here, or a pull request in the boilerplate kept
open without merging.

## Decision

`apps/boilerplate` holds a copy of boilerplate_solidjs, taken at commit
`31de7bf`. It uses `@evertondgn/solid-tooling` from the workspace, built to
`dist/`, in place of its own rules, formatter settings and TypeScript base. The
CI runs its check, type check, dead code, unit and browser tests, tooling tests,
build and end-to-end tests on every pull request.

The copy leaves out what belongs to the original repository: the release
automation, the CI workflows and their reuse proof, Git hooks and the Vercel
deploy. [Development](../development.md#what-changed-from-the-original) lists
every change.

## Consequences

- A package change that breaks a complete application fails in the pull request,
  before a version is published.
- boilerplate_solidjs is not touched and keeps its own copy of the tooling until
  another decision.
- The copy does not follow the original on its own. The boilerplate received 118
  commits on `main` in the seven days before this decision, so the copy needs
  updates to stay representative.
- The workspace root holds the catalog, overrides and patches of the
  application, because Bun reads them only there.
- In a Vite+ monorepo, `vp check` uses the root `lint` and `fmt` config, so the
  application runs `vp fmt --check` and `vp lint` instead.
- The root scripts select `./packages/*`, so the publish job does not run the
  application suites.
