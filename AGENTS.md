# Working in this repository

This monorepo publishes three npm packages and keeps a copy of the boilerplate
application:

| Folder                             | Content                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `packages/solid-tooling`           | `@evertondgn/solid-tooling`: presets, lint rules, tasks and test setup            |
| `packages/solid-runtime`           | `@evertondgn/solid-runtime`: runtime helpers, published as TypeScript source      |
| `packages/vite-plugin-solid-icons` | `@evertondgn/vite-plugin-solid-icons`: the Vite plugin of the icons               |
| `apps/boilerplate`                 | The boilerplate application, with its own [AGENTS.md](apps/boilerplate/AGENTS.md) |
| `fixtures/apps`                    | Minimal applications for the installed application scenarios                      |
| `tooling/release`                  | The merge command, the wait in the publish job and the release lockfile check     |

Read [Contributing](CONTRIBUTING.md), [Development](docs/development.md) and
[Releasing](docs/releasing.md) before changing a package. The rules below are
the ones that cost a fix after a release when they were missed.

The code conventions of [the boilerplate app](apps/boilerplate/AGENTS.md) apply
to `packages/` and `tooling/` too: "File and folder names of modules",
"TypeScript types", "Type location", "Cohesion and size of modules", "Function
parameters", "Events in JSX", "Conditionals and control flow", "Exports",
"Functions that return a Promise", "Code comments", "Boolean names" and "Signal
names".

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
  the commit scope. A commit for one package must not touch the folder of
  another: a `fix` that edits `packages/solid-tooling/` also releases the
  tooling.
- The packages share one version number: a release of one raises the others to
  the same version, in one release pull request.
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
  out of the `dependencies`, `peerDependencies` and `optionalDependencies` of
  `packages/solid-runtime`. Copy a type instead of importing it from one of
  them. `vp run test:tarball` fails when one of these names reaches a
  production section. It does not follow the dependencies of a dependency, so
  check the `dependencies` and required `peerDependencies` of every production
  dependency you add.
- The icons plugin runs in the build of the application, so it takes
  `vite-plus` as a peer, as
  [ADR 0037](docs/ADRs/0037-icons-vite-plugin-package.md) records. Its other
  build tools stay in `devDependencies`.

## Pull requests and releases

- Merge with `vp run release:merge <number> --sha <head>`, which makes the merge
  commit described in
  [Merging a pull request](docs/releasing.md#merging-a-pull-request). Pass the
  head you reviewed, which `--dry-run` prints; the command stops on another
  head. `--sha` is required for a release pull request, whose merge publishes
  on npm. After updating a branch that is behind, the command goes on only with
  a new head whose files it checked, and otherwise prints the command that
  merges that head once you review it. Never squash or rebase.
- Before merging a release pull request, follow
  [the checklist](docs/releasing.md#before-merging-a-release-pull-request).
- The first automated release of a package needs a trusted publisher, which only
  the maintainer can create on npm
  ([First automated release](docs/releasing.md#first-automated-release-of-a-package)).

## Maintaining the boilerplate copy

- `apps/boilerplate` is a copy of `boilerplate_solidjs` at commit `6145493`, used to
  test the packages of the monorepo in a complete application. The
  `README.md` of the application lists what changed from the original.
- The lint rules, the formatter, the tsconfigs, the Vite and Nitro config
  (`defineSolidApp`), the Vitest projects (`solidTest`), the Playwright config
  (`definePlaywrightConfig`) and the Knip (`defineKnipConfig`) and Stylelint
  (`checkCss`) configs come from the `@evertondgn/solid-tooling` package.
  `tooling/knip.ts` and `tooling/css/check.ts` only pass to the package what
  belongs to this application. The `packages/solid-tooling/src/...` paths cited
  in the application guides resolve from the monorepo root. To change a rule, change it in the package and
  run `vp run test` at the monorepo root.
- In the tracked copy, the sections about release automation, the CI workflow, Git hooks and the
  Vercel deploy describe the original repository and do not apply to this copy.
- This file, the guides in `docs/`, the code comments and the test titles are in
  English. The tests check the interface in its three languages. When bringing a
  change from the original, translate its documentation, comments and test
  titles.

