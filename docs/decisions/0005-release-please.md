# 0005. release-please versions each package

- Status: Accepted
- Date: 2026-11-11

## Context

Each package needs its own version, changelog and tag. The options were:

- [release-please](https://github.com/googleapis/release-please): reads the
  Conventional Commits already in use and keeps one release pull request open
  per package. It runs as a GitHub Action with two JSON files, without a
  dependency in the project.
- Changesets: a file written by hand for each change, saying which package goes
  up and by how much. It adds a dependency and a manual step to every pull
  request.
- Adapting the release automation of boilerplate_solidjs to several packages:
  about 1,500 lines to adapt, test and maintain.
- Versioning by hand.

## Decision

release-please runs in `.github/workflows/release.yml`, in manifest mode, with
`release-please-config.json` and `.release-please-manifest.json`. Tags take the
form `solid-tooling@0.2.0`. Below 1.0.0, a breaking change raises the minor
version.

## Consequences

- The commit type and the folder of the changed files decide the version. Commit
  messages have to follow Conventional Commits.
- Merging a release pull request creates the tag and the GitHub Release, and
  starts the publish job ([ADR 0006](0006-trusted-publishing.md)).
- release-please does not update the workspace version in `bun.lock`, which
  stays one version behind until the next `vp install`.
- The workspace format check skips `CHANGELOG.md`, which release-please writes
  in its own format.
- The first version of a package is published by hand, and release-please starts
  from its tag. Version 0.1.0 was added to the changelog by hand for that
  reason.
