# solidjs_base

Packages shared by SolidJS applications built with
[Vite+](https://viteplus.dev/guide/). An application installs them as
dependencies and gets fixes through a version update, instead of keeping a copy
of the code in its own repository.

## Packages

| Package                                               | Content                                                |
| ----------------------------------------------------- | ------------------------------------------------------ |
| [`@evertondgn/solid-tooling`](packages/solid-tooling) | Lint preset, lint rules, formatter and TypeScript base |

The code in `packages/solid-tooling/src` came from `tooling/` in
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs), at
commit `31de7bf`.

## Using a package

Installation, configuration and entry points are in the
[package README](packages/solid-tooling/README.md).

## Working on this repository

Install the global [Vite+](https://viteplus.dev/guide/) CLI. The Node and Bun
versions are set in the root `package.json`.

| Command               | What it does                                                 |
| --------------------- | ------------------------------------------------------------ |
| `vp install`          | Install the workspace dependencies                           |
| `vp run build`        | Compile the packages to `dist/`                              |
| `vp run check`        | Check format, lint and types                                 |
| `vp run test`         | Run the rule tests in Node                                   |
| `vp run test:tarball` | Install the packed package in a test application and lint it |
| `vp run validate`     | Run all of the above, in this order                          |

The rule tests that go through the CLI load the plugins from `dist/`, so
`vp run test` compiles the package first.

`fixtures/consumer` is the test application. It declares only what a real
application has to declare, and `vp run test:tarball` installs the packed
package into a copy of it.

## Versions and releases

Each package has its own version, in its `package.json`, and is published on its
own to the public npm registry under the `@evertondgn` scope. The workspace root
is private and is never published.

[release-please](https://github.com/googleapis/release-please) derives the
versions from Conventional Commits. It runs only in CI, from
`.github/workflows/release.yml`, and is not a dependency of the project.

1. A commit on `main` that changes files of a package goes into the next version
   of that package. The package is found by the folder of the changed files. The
   commit scope (`feat(tooling): ...`) is only for people reading the history.
2. The workflow keeps one release pull request open per package, with the new
   version and the package `CHANGELOG.md`.
3. Merging that pull request creates the tag, such as `solid-tooling@0.2.0`, and
   the GitHub Release. The workflow then validates the workspace, packs the
   package and publishes it.

The publish step uses no token. npm authenticates the workflow through OIDC
([trusted publishing](https://docs.npmjs.com/trusted-publishers)) and attaches
the build provenance to the version.

| Commit                                              | Bump below 1.0.0        |
| --------------------------------------------------- | ----------------------- |
| `fix`                                               | Patch                   |
| `feat`                                              | Minor                   |
| `!` in the header or `BREAKING CHANGE:` in a footer | Minor                   |
| Other types (`chore`, `docs`, `test`, `refactor`)   | No release on their own |

From 1.0.0 on, a breaking change raises the major version.

### Configuration files

- `release-please-config.json` lists the packages and the rules. A new package
  goes under `packages`, keyed by its folder.
- `.release-please-manifest.json` holds the last released version of each
  package. release-please updates it. Edit it by hand only to add a package that
  already has a published version.

### One-time setup

On GitHub, turn on "Allow GitHub Actions to create and approve pull requests" in
Settings > Actions > General. Without it release-please cannot open the release
pull request.

On npmjs.com, each package needs a trusted publisher. Create it at the moment
described in
[First automated release of a package](#first-automated-release-of-a-package):
go to Packages > the package > Settings > Trusted publishing and choose GitHub
Actions.

| Field                | Value          |
| -------------------- | -------------- |
| Organization or user | `everton-dgn`  |
| Repository           | `solidjs_base` |
| Workflow filename    | `release.yml`  |
| Environment name     | empty          |
| Allowed actions      | `npm publish`  |

npm does not check these values when you save, and they are case-sensitive. The
`repository.url` in the package `package.json` has to point to this repository.

### New package

A trusted publisher is created in the settings of a package, so the package has
to exist on the registry first. Publish the first version of each package
[by hand](#publishing-by-hand). The workflow publishes the following ones.

### First automated release of a package

The package must already be on npm, as described above. A new trusted publisher
expires if the workflow does not publish with it within two days, so create it
only when a release is ready:

1. Wait for release-please to open the release pull request. It opens after a
   `fix` or `feat` for the package reaches `main`.
2. Create the trusted publisher on npmjs.com, with the values in
   [One-time setup](#one-time-setup).
3. Merge the release pull request within two days.

If the trusted publisher expires, delete it and create another one.

### When the publish job fails

The release job runs before the publish job. If publishing fails, the tag and
the GitHub Release already exist and npm has no new version.

Fix the cause, then open the failed run on GitHub and choose "Re-run failed
jobs". The publish job runs again with the output of the release job from the
first attempt. GitHub allows this for 30 days.

Pushing a new commit does not publish the missing version: release-please finds
the tag and creates no release, so the publish job is skipped.

The usual causes are a missing or expired trusted publisher, a field that does
not match the table in [One-time setup](#one-time-setup), and an npm version
older than the one the publish job checks for.

### Known limit

`bun.lock` records the version of each workspace package, and release-please
does not update it. After a release the line stays one version behind until the
next `vp install`, which fixes it. The frozen-lockfile install in CI does not
fail because of this.

### Publishing by hand

To publish outside the workflow, from a clean tree:

```bash
npm login
vp run validate
vp -C packages/solid-tooling pm pack --pack-destination /tmp/solid-tooling
npm publish /tmp/solid-tooling/evertondgn-solid-tooling-0.1.0.tgz --access public
```

Replace `0.1.0` with the version in the package `package.json`.

- `vp run validate` compiles the package before it is packed.
- `vp pm pack` replaces `catalog:` and `workspace:` with real versions. Running
  `npm publish` in the package folder does not: the published manifest keeps the
  `catalog:` entries.
- The npm account needs two-factor authentication. `npm publish` prints a link
  and waits for the confirmation in the browser, so run it in an interactive
  terminal. The link is valid for five minutes.

After the first version of a package is published, create the tag on the
published commit, in the form `solid-tooling@0.1.0`. release-please starts from
it to work out the next version.
