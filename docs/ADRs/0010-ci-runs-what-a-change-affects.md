# 0010. The CI runs only the jobs a change affects

- Status: Accepted, amended by [0017](0017-main-reuses-the-pull-request-run.md)
- Date: 2026-11-13

## Context

Every pull request ran the package validation and the full suite of
`apps/boilerplate`, from 2.5 to 3 minutes, even when it changed only
documentation. The `main` ruleset required the two jobs by name, `Packages` and
`Boilerplate app`, so a job could not be split or renamed without editing the
ruleset in the same step.

In the last run before this change, the `Boilerplate app` job took about 140
seconds: 72 for the end-to-end tests, 31 for the tests with coverage, and 11 for
the check, the Node type check and the dead code search together.

GitHub offers two ways to skip work:

- Path filters on the workflow trigger. A workflow skipped by a path filter
  leaves its checks pending, and a pending required check blocks the merge
  ([GitHub docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#using-filters-to-target-specific-paths-for-pull-request-or-push-events)).
- An `if` on each job. A job skipped this way reports success, even when it is a
  required check
  ([GitHub docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)).

## Decision

- A `Changes` job lists the files of the pull request through the GitHub API and
  sets one output per area: docs, packages and app. Each job has an `if` on its
  output. Pushes to `main` and manual runs set every output.
- The file list comes from `gh api`, with no third-party action, so the job
  needs only `pull-requests: read` and works for pull requests from forks.
- The app suites run in two parallel jobs, one of them only for the end-to-end
  tests.
- A `CI required` job depends on every other job and fails when any of them
  failed or was cancelled. It is the only check the ruleset requires.
- The Vite Task cache is not restored across runs. The steps it could replay
  take about 11 seconds together, and the Vite+ documentation calls the feature
  experimental.

## Consequences

- A pull request that changes only documentation runs the format and link
  checks, without the app suites.
- Adding, splitting or renaming a job does not touch the ruleset; the new job
  only needs to be listed in the `needs` of `CI required`.
- Pushes to `main` still run everything, so `main` keeps a full result for every
  merge.
- The classification lives in a shell `case` in `ci.yml`. A file that matches no
  pattern runs every job, so a new kind of file errs on the side of more checks.
