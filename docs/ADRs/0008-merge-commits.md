# 0008. Pull requests are merged with merge commits

- Status: Accepted
- Date: 2026-11-12

## Context

Branches are never squashed: a merge commit keeps each commit of the branch in
the history of `main`.

release-please reads every commit that reaches `main`, including the commits of
a merged branch and the merge commit itself, and a commit message can hold more
than one Conventional Commit. GitHub writes the pull request title into the
merge commit. The repository settings API accepts three combinations for the
merge commit title and body, and all of them include the pull request title.

## Decision

Pull requests are merged with a merge commit, never squashed or rebased.

## Consequences

- The changelog lists each `feat` and `fix` commit of a branch, so commit
  messages are written for it.
- A pull request whose title is a `feat` or `fix` adds one more changelog entry,
  taken from the title in the merge commit. Version 0.2.0 had one, removed by
  hand.
- Merging through the GitHub API with an empty commit body leaves the title out
  of the merge commit. The command is in
  [Releasing](../releasing.md#known-limits).
