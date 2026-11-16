# 0038. A workflow writes the workspace versions in the release lockfile

- Status: Accepted
- Date: 2026-11-16

## Context

Bun copies the version of each workspace from its `package.json` into
`bun.lock`. release-please raises the versions in the `package.json` files of
the release pull request but has no updater for `bun.lock`: its JSON updater
reads the file with `JSON.parse`, and `bun.lock` is JSONC with trailing commas,
while its generic updater depends on comments that Bun removes
([release-please#2689](https://github.com/googleapis/release-please/issues/2689),
with a fix proposed in
[release-please#2684](https://github.com/googleapis/release-please/pull/2684)).
[ADR 0005](0005-release-please.md) recorded the consequence: the lock stays one
version behind after each release. Nothing fails, because the frozen-lockfile
install accepts the lock and `vp pm pack` reads the version from the
`package.json`, but any ordinary `vp install` rewrites those lines and leaves
the tree changed.

The options were:

- Keeping the known limit.
- Waiting for release-please to update `bun.lock`.
- A step in the `Release pull request` job of `release.yml`. The merge command
  follows the conclusion of the whole `Release` run, so a failure of that step
  would stop the command before it checks npm.
- A workflow of its own, on the pushes to the release branch.

## Decision

- `.github/workflows/release-lockfile.yml` runs on the pushes to the branches
  that start with `release-please--`, with no permission at the top and one run
  at a time for each branch.
- `Generate the lockfile` can only read the repository. It runs
  `vp install --lockfile-only --ignore-scripts` and hands `bun.lock` to the next
  job as an artifact kept for one day.
- `Commit the workspace versions` checks out the same commit and runs
  `tooling/release/update-lockfile-versions.ts`, which accepts only changed
  `"version"` lines of workspace entries, each equal to the `package.json` of
  its folder inside the repository, and writes nothing otherwise. After that,
  and only when the lock changed, the job creates a token of the release GitHub
  App that can write contents, commits as the App and pushes with a lease on the
  checked commit, so a branch that moved or was deleted is neither overwritten
  nor created again. It installs no dependency and runs neither `vp` nor `bun`.

## Consequences

- The release pull request carries in `bun.lock` the versions of its
  `package.json` files, and `main` has them after the merge.
- Each rewrite of the release pull request starts two CI runs, the first one
  cancelled by the lockfile commit, and two runs of the workflow, the second one
  without a difference. Opening the pull request gives one more run, on the
  commit of `main` where release-please creates the branch, which ends without
  writing.
- A second workflow reads the secret of the App. Its token can write contents
  only, and the job that runs `vp install` holds no token that can write.
  Creating the token after the command does not isolate it from the code of the
  branch, since an earlier step can write to `$GITHUB_ENV`, `$GITHUB_PATH` or
  the Git config. Whoever can push to a `release-please--` branch controls this
  workflow, and the key is a repository secret that a workflow of any branch can
  read, as [ADR 0035](0035-release-pull-request-app.md) records. Restricting it
  is a setting of the owner, such as an environment with deployment branch rules
  and a ruleset on the branches it admits, which this workflow does not set.
- The head of the release pull request changes once more after each rewrite, so
  the review waits for the run of the workflow
  ([Releasing](../releasing.md#before-merging-a-release-pull-request)).
- A dependency change merged into `main` while the release pull request is open
  changes `bun.lock` on both sides, and the merge command stops on that file
  when it updates the branch.
- A failure leaves the old versions in the lock and stops nothing else
  ([Releasing](../releasing.md#when-the-release-lockfile-workflow-fails)).
- When release-please updates `bun.lock`, the workflow, the command and its
  tests are removed.
