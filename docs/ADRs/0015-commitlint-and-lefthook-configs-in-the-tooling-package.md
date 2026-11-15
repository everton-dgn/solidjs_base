# 0015. The commitlint config and the Git hooks ship in the tooling package

- Status: Accepted; tool dependency ownership superseded by
  [0027](0027-packaged-tool-dependencies.md)
- Date: 2026-11-13

## Context

boilerplate_solidjs keeps a `.commitlintrc` (9 lines) that extends
`@commitlint/config-conventional` and changes four rules, and a `.lefthook.yml`
(58 lines) with the `commit-msg`, `pre-commit` and `pre-push` hooks. Every
application built from it repeats both files. The release tests of the original
are the only jobs that do not apply to every application.

A test application outside the workspace, with the package installed by tarball
and Bun's isolated linker, tried both from the package:

| Question                                                 | Result                                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A config that spreads `config-conventional`              | Accepted `feat(tooling)!: ...`, which needs the parser preset of `config-conventional`, and rejected a sentence-case subject with a stop |
| A config that extends `config-conventional` by file path | Same result                                                                                                                              |
| A config that extends it by file URL                     | commitlint failed on every message                                                                                                       |
| `extends` of `.lefthook.yml` pointing to `node_modules`  | Lefthook merged the shared hooks, and the hooks ran on real commits                                                                      |
| The full boilerplate copy with the shared hooks          | `pre-commit` fixed and staged a file, `commit-msg` rejected a bad message, and `pre-push` passed                                         |
| Knip on that copy                                        | No report for `@commitlint/cli` or `lefthook`, with or without their config files; an unused dependency added as a control was reported  |
| `lefthook` installed without `trustedDependencies`       | Bun did not run its install script, so no hooks and no generated `lefthook.yml`                                                          |

## Decision

- `./commitlint` exports the config. It spreads `config-conventional` and sets
  the four rules of the original: header up to 100 characters, a blank line
  before the footer, and warnings for body and footer lines over 100 characters.
  `@commitlint/config-conventional` is a dependency of the package, so the
  application declares only `@commitlint/cli`.
- `./lefthook.yml` ships the hooks of the original without the release tests.
  The jobs call the `package.json` scripts of the application by name, as the
  original does, and the messages are in English ([ADR 0007](0007-english.md)).
- `@commitlint/cli` and `lefthook` are optional peer dependencies, pinned to
  exact versions like the others ([ADR 0002](0002-compiled-tooling-package.md)).
- The tarball test installs both in the consumer fixture and checks that the
  hooks merge and that `commit-msg` accepts and rejects messages through the
  installed package.

## Consequences

- An application keeps a one-line `.commitlintrc`, a two-line `.lefthook.yml`,
  `lefthook` in `trustedDependencies` and the scripts the jobs call.
- Lefthook applies `extends` over `.lefthook.yml`. A job of the application
  declared there runs before the shared jobs, and one with the name of a shared
  job does not replace it. A shared job is changed or skipped from
  `lefthook-local.yml`, which Lefthook applies last; the order stays and new
  jobs run at the end. A copy of the application checked the three cases.
- `.lefthook.yml` has to exist before the first install; otherwise the install
  script of Lefthook writes a `lefthook.yml`, which takes precedence.
- The boilerplate copy in the monorepo has no hooks, because Lefthook would
  install them for the whole repository. The tarball test and a copy installed
  from the tarball cover them.
- The CI step that runs commitlint on the commits of a pull request stays with
  the application workflows, which move to reusable workflows later.
