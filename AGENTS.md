# Working in this repository

This monorepo publishes two npm packages and keeps a copy of the boilerplate
application:

| Folder                   | Content                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `packages/solid-tooling` | `@evertondgn/solid-tooling`: presets, lint rules, tasks and test setup             |
| `packages/solid-runtime` | `@evertondgn/solid-runtime`: runtime helpers, published as TypeScript source       |
| `apps/boilerplate`       | The boilerplate application, with its own [AGENTS.md](apps/boilerplate/AGENTS.md) |
| `fixtures/apps`          | Minimal applications for the installed application scenarios                      |

Read [Contributing](CONTRIBUTING.md), [Development](docs/development.md) and
[Releasing](docs/releasing.md) before changing a package. The rules below are
the ones that cost a fix after a release when they were missed.

## Validation

- Run `vp run validate` at the root. It runs the build, check, dead code,
  package tests, tarball tests and installed application scenarios, as the
  publish job does.
- A change in `apps/boilerplate` also runs the commands of
  [the boilerplate app section](docs/development.md#the-boilerplate-app). The CI
  runs them for a package change too, so run them when the change reaches a
  preset or the runtime code the application uses.

## Commits

- Write [Conventional Commits](https://www.conventionalcommits.org/), one change
  per commit, with the package as the scope: `fix(tooling): ...`. The changelog
  publishes the messages as written.
- release-please finds the package by the folder of the changed files, not by
  the commit scope. A commit for one package must not touch the folder of the
  other: a `fix` that edits `packages/solid-tooling/` also releases the tooling.
- `fix` and `feat` commits start a release. `docs`, `test` and `chore` commits
  do not, unless they carry a breaking change marker.
- A `BREAKING CHANGE:` footer is published as written. Describe what changes for
  an application that updates from the last published version and what it has
  to do, not the difference from your previous commit.
- Do not write a breaking change footer for an option that never reached a
  published version. When a branch changes again something it already
  announced, the earlier footer cannot be edited without rewriting history, so
  it is fixed in the release pull request before the merge.

## Package dependencies

- Applications install the runtime in production. Keep build and test tools,
  such as `vite`, `vite-plus`, `vitest`, `rolldown` and `@solidjs/vite-plugin`,
  out of its `dependencies`, `peerDependencies` and `optionalDependencies`. Copy
  a type instead of importing it from one of them. `vp run test:tarball` fails
  when one of these names reaches a production section. It does not follow the
  dependencies of a dependency, so check the `dependencies` and required
  `peerDependencies` of every production dependency you add.

## Pull requests and releases

- Merge with a merge commit, through the command in
  [Merging a pull request](docs/releasing.md#merging-a-pull-request). Never
  squash or rebase.
- Before merging a release pull request, follow
  [the checklist](docs/releasing.md#before-merging-a-release-pull-request).
- The first automated release of a package needs a trusted publisher, which only
  the maintainer can create on npm
  ([First automated release](docs/releasing.md#first-automated-release-of-a-package)).
