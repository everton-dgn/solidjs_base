# Commit messages and Git hooks

[Tooling reference](README.md)

`./commitlint` is the commitlint config: the Conventional Commits rules of
`@commitlint/config-conventional`, with the header limited to 100 characters, a
blank line required before the footer, and a warning for body and footer lines
over 100 characters. The package installs the CLI and the application points its
config to the package:

```json
// .commitlintrc
{ "extends": ["@evertondgn/solid-tooling/commitlint"] }
```

`./lefthook.yml` holds the Git hooks. Lefthook comes with the package. The
application opts out of automatic install scripts and extends the shared config:

```json
// package.json
{ "trustedDependencies": [] }
```

```yaml
# .lefthook.yml
extends:
  - node_modules/@evertondgn/solid-tooling/lefthook.yml
```

| Hook         | Jobs                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit-msg` | `commitlint` on the message                                                                                                                                    |
| `pre-commit` | `check:fix` on the staged files, which are staged again after the fix, and `scan:secrets --staged` when `kingfisher` is installed. Skipped in merge and rebase |
| `pre-push`   | `check:ci`, `typecheck:node` and `test:ci` in order, then `test:tooling` and `dead-code` together. The first failure stops the rest                            |

The jobs call `package.json` scripts by name, so the application defines
`check:fix`, `scan:secrets`, `check:ci`, `typecheck:node`, `test:ci`,
`test:tooling` and `dead-code`.

Lefthook applies the files in `extends` over `.lefthook.yml`, so:

- A job added in `.lefthook.yml` runs before the shared jobs of the same hook.
- A job declared there with the name of a shared job does not change it.
- To change or skip a shared job, declare a job with the same name in
  `lefthook-local.yml`, which Lefthook applies last, also inside a group. The
  rest keeps its order, and new jobs in that file run after the shared ones.
  Commit the file to change the job for everyone, or keep it out of Git to
  change it on one machine.

Create `.lefthook.yml` before installing hooks, then run:

```bash
vp exec node node_modules/@evertondgn/solid-tooling/dist/cli.mjs lefthook install
```

With `defineSolidApp`, `vp run lefthook install` is equivalent. The shared
`commit-msg` job calls the packaged command entry, so it also works with Bun's
isolated linker and no application-level `commitlint` binary. No direct
`@commitlint/cli` or `lefthook` dependency is required. Repeat the install
command after relocating an installation: generated hooks record the executable
path. Keeping `trustedDependencies: []` prevents Bun's default trusted Lefthook
postinstall from generating a sample config or changing hooks during an ordinary
dependency install.
