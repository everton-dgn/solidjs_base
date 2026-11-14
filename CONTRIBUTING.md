# Contributing

Thanks for taking the time to help. This guide covers what you need to open a
pull request. The [development guide](docs/development.md) has the details of
the workspace, and the [architecture guide](docs/architecture.md) explains what
belongs in each package.

## Before you start

- Report bugs and propose changes in
  [issues](https://github.com/everton-dgn/solidjs_base/issues/new/choose). For a
  security problem, follow [SECURITY.md](SECURITY.md) instead.
- Open an issue before a change larger than a fix, such as a new rule, a new
  entry point or a different default in a preset, so we can agree on the shape
  first.
- Problems in the application starter itself belong in
  [boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs/issues).

## Setup

Install the [Vite+ CLI](https://viteplus.dev/guide/) (`vp`). It takes the Bun
version from `packageManager` and the Node version from `devEngines` in the root
`package.json`, and downloads them when they are missing.

```bash
git clone https://github.com/everton-dgn/solidjs_base.git
cd solidjs_base
vp install
vp run build
```

`vp run build` compiles the packages to `dist/`. The application in
`apps/boilerplate` loads the presets from there, so run it again after you
change a package.

When changing tooling dependencies, update the package manifest and lockfile. Do
not add a dependency back to an application just to make the workspace pass: the
installed fixtures exercise both Bun linkers with reduced manifests. Keep
application-owned imports and Vite+ overrides aligned with the package versions.
Use `vp run tsc`, `vp run knip` and `vp run playwright` in applications using
`defineSolidApp`; their executables resolve from the tooling package. See
[the dependency contract](docs/tooling/limits.md).

## Where things live

```text
packages/solid-tooling/   the published package: lint preset, rules, formatter, TypeScript base
apps/boilerplate/         copy of boilerplate_solidjs that runs on the workspace package
fixtures/consumer/        small application that installs the packed tarball
fixtures/apps/            minimal applications that install, test and build from the tarballs
docs/                     guides and architecture decision records (ADRs)
.github/workflows/        CI and the release workflow
```

## Checking your change

| You changed             | Run from the root                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Anything in `packages/` | `vp run validate`: build, check, dead code, package tests, tarball tests and scenarios |
| Only a lint rule        | `vp run test` while you work, then `vp run validate`                                   |
| `apps/boilerplate`      | The commands in [the boilerplate app section](docs/development.md#the-boilerplate-app) |
| Only documentation      | `vp fmt`                                                                               |

The CI runs the same commands and skips the jobs your files do not affect.

### Adding or changing a lint rule

1. Write the rule in the plugin folder under `packages/solid-tooling/src/`, next
   to the rules it belongs with.
2. Add valid and invalid cases to the plugin's `__tests__/` folder. The rule
   message should say what to do instead, not only what is wrong.
3. If you add a plugin, add a file with one violation to
   `fixtures/consumer/src/` and its expected diagnostic to `EXPECTED` in
   `packages/solid-tooling/src/tarball/__tests__/tarball.test.ts`. The tarball
   test then proves that the published package reports it.
4. List the rule in the
   [lint guide](docs/tooling/lint.md#rules-of-this-package).

## Conventions

- Code, comments, documentation and commit messages are in English
  ([ADR 0007](docs/ADRs/0007-english.md)).
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
  Use the package as the scope when the commit touches one, as in
  `fix(tooling): ...`. release-please reads the commits on `main` to pick the
  next version: `fix` makes a patch, `feat` a minor, and a `!` after the type or
  a `BREAKING CHANGE:` footer a major (a minor while the version is `0.x`).
- Keep each commit to one change. Pull requests are merged with a merge commit
  and never squashed, so your commits stay in the history
  ([ADR 0008](docs/ADRs/0008-merge-commits.md)).
- Comments explain why, not what. If a rationale needs more than a few lines, it
  goes to `docs/` or to an ADR.

## Pull requests

- Keep one topic per pull request and fill in the template.
- `CI required` must pass. CodeRabbit and Codex comment on pull requests on
  their own; answer or resolve each thread, because `main` requires resolved
  conversations.
- The maintainer merges once the checks pass and the review is done.

## Releases

Releases are automated. See [Releasing](docs/releasing.md) for how versions,
changelogs and npm publishing work.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
