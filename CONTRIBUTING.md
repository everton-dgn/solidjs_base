# Contributing

Thanks for taking the time to help. This guide covers what you need to open a
pull request. The [development guide](docs/development.md) has the details of
the workspace, and the [architecture guide](docs/architecture.md) explains what
belongs in each package.

The workspace also contains the private application generator in
`packages/create-solid`. It joins the linked release group after its first
manual registry release.

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
vp exec -F @evertondgn/vite-plugin-solid-icons playwright install chromium
```

`vp run build` compiles the packages to `dist/`. The application in
`apps/boilerplate` loads the presets from there, so run it again after you
change a package.

The last command downloads the Chromium of the Playwright version the packages
pin. `vp run validate` needs it: the browser tests of the runtime and of the
icons plugin and the client-only scenario open it, while the CI uses the Chrome
of the runner. The filter runs the Playwright of the icons plugin, because the
root has no `playwright` binary: there, `vp exec playwright` fails, or runs a
global installation that can download another Chromium build.

When changing tooling dependencies, update the package manifest and lockfile. Do
not add a dependency back to an application just to make the workspace pass: the
installed fixtures exercise both Bun linkers with reduced manifests. Keep
application-owned imports and Vite+ overrides aligned with the package versions.
Use `vp run tsrs`, `vp run knip` and `vp run playwright` in applications using
`defineSolidApp`; their executables resolve from the tooling package. See
[the dependency contract](packages/solid-tooling/docs/limits.md).

## Where things live

```text
packages/solid-tooling/             published package: defineSolidApp, lint and format presets, rules,
                                    TypeScript base, test presets, Knip, Stylelint, commitlint, Git hooks
                                    and the i18n and icons generators
packages/solid-runtime/             published package: runtime helpers, shipped as TypeScript source
packages/vite-plugin-solid-icons/   published package: the icons plugin that the tooling loads
apps/boilerplate/                   copy of boilerplate_solidjs that runs on the workspace package
fixtures/consumer/                  small application that installs the packed tarball
fixtures/apps/                      minimal applications that install, test and build from the tarballs
tooling/release/                    the merge command, the wait in the publish job and the release lockfile check
docs/                               guides and architecture decision records (ADRs)
.github/workflows/                  CI and the release workflows
```

## Checking your change

| You changed             | Run from the root                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Anything in `packages/` | `vp run validate`: build, check, dead code, package tests, tarball tests and scenarios          |
| Only a lint rule        | `vp run test` while you work, then `vp run validate`                                            |
| `apps/boilerplate`      | The commands in [the boilerplate app section](docs/development.md#the-boilerplate-app)          |
| Only documentation      | `vp fmt`, plus `vp fmt` inside `apps/boilerplate` for its files, which the root formatter skips |

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
   [lint guide](packages/solid-tooling/docs/lint.md#rules-of-this-package).

## Conventions

- Code, comments, documentation and commit messages are in English
  ([ADR 0007](docs/ADRs/0007-english.md)).
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
  Use the package as the scope when the commit touches one, as in
  `fix(tooling): ...`. release-please reads the commits on `main` to pick the
  next version: `fix` makes a patch, `feat` a minor, and a `!` after the type or
  a `BREAKING CHANGE:` footer a major (a minor while the version is `0.x`).
- The changelog publishes a `BREAKING CHANGE:` footer as written. Describe what
  changes for an application that updates from the last published version and
  what it has to do, not the difference from your previous commit. Do not write
  one for an option that never reached a published version. When a branch
  changes the same option more than once before a release, each footer is
  published, and the wrong ones are fixed in the release pull request before its
  merge ([checklist](docs/releasing.md#before-merging-a-release-pull-request)).
- Keep each commit to one change. Pull requests are merged with a merge commit
  and never squashed, so your commits stay in the history
  ([ADR 0008](docs/ADRs/0008-merge-commits.md)).
- Comments explain why, not what. If a rationale needs more than a few lines, it
  goes to `docs/` or to an ADR.
- The code conventions of [the boilerplate app](apps/boilerplate/AGENTS.md)
  apply to `packages/` and `tooling/` too: "File and folder names of modules",
  "TypeScript types", "Type location", "Cohesion and size of modules", "Function
  parameters", "Events in JSX", "Conditionals and control flow", "Exports",
  "Functions that return a Promise", "Code comments", "Boolean names" and
  "Signal names".

## Pull requests

- Keep one topic per pull request and fill in the template.
- `CI required` must pass. CodeRabbit and Codex comment on pull requests on
  their own; answer or resolve each thread, because `main` requires resolved
  conversations.
- The maintainer merges once the checks pass and the review is done, with the
  command in [Merging a pull request](docs/releasing.md#merging-a-pull-request).
  The merge button would add the title of a `feat` or `fix` pull request to the
  changelog as one more entry.

## Releases

Releases are automated. See [Releasing](docs/releasing.md) for how versions,
changelogs and npm publishing work.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
