# 0035. A GitHub App opens the release pull request

- Status: Accepted
- Date: 2026-11-15

## Context

[ADR 0005](0005-release-please.md) runs release-please in
`.github/workflows/release.yml`, and the release pull request was opened with
the workflow's `GITHUB_TOKEN`. GitHub holds the CI runs of a pull request that a
workflow opens or updates with that token until someone with write access
approves them. Every rewrite of the release pull request therefore waited for an
approval before `CI required` could pass, a consequence recorded in
[ADR 0017](0017-main-reuses-the-pull-request-run.md). A token of a GitHub App
does not have that hold.

The options were:

- Approving the held run by hand before each merge, as until now.
- Starting the CI on the release branch with `workflow_dispatch`, which GitHub
  does not hold. It was tried and removed: the `main` ruleset does not count the
  checks of a `workflow_dispatch` run for its required check, so the held run
  still needed the approval.
- Opening the release pull request with the token of a GitHub App.

## Decision

- release-please runs in two jobs. `Tags and GitHub Releases` keeps the
  `GITHUB_TOKEN` and its permissions, and only creates the tags and GitHub
  Releases (`skip-github-pull-request`).
- `Release pull request` only opens or updates the release pull request
  (`skip-github-release`), with an installation token of a private GitHub App
  installed only on this repository, with read and write access to Contents,
  Issues and Pull requests.
- `Release pull request` needs `Tags and GitHub Releases`, so the tags exist
  before it computes the next release pull request. The publish job does not
  depend on it.
- The job has no fallback to the `GITHUB_TOKEN`.

## Consequences

- The CI of the release pull request starts on its own, as in any other pull
  request. The approval is no longer a step of a release.
- The repository needs the App, the `RELEASE_APP_CLIENT_ID` variable and the
  `RELEASE_APP_PRIVATE_KEY` secret
  ([One-time setup](../releasing.md#one-time-setup)). A copy or fork of the
  repository fails in this job until it has its own.
- The App token is stronger than the `GITHUB_TOKEN` in one way: what it does
  starts workflows. A merge made with it would start the release workflow, and
  the publication with it. The job asks only for Contents, Issues and Pull
  requests, for this repository, and the token is revoked when the job ends.
- The private key does not expire on its own, and any workflow on a branch of
  this repository can read the secret; pull requests from forks cannot.
  Replacing the key means a new key and a new secret.
- The key belongs to the App, not to one installation. Another repository that
  uses the same App needs its own installation, variable and secret, and its
  secret reaches every repository the App is installed on.
- A failure of the App stops only the release pull request: the tags, the GitHub
  Releases and the publication go on. Without a fallback, the job fails instead
  of opening a pull request whose runs are held, and running it again recovers
  it ([Releasing](../releasing.md#when-the-release-pull-request-job-fails)).
- Each push to `main` runs release-please twice, in two short jobs.
- No job opens a pull request with the `GITHUB_TOKEN`, so the repository no
  longer needs "Allow GitHub Actions to create and approve pull requests".
