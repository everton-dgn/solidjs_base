# 0017. A push to main reuses the pull request run that checked the same tree

- Status: Accepted
- Date: 2026-11-13

## Context

After [ADR 0010](0010-ci-runs-what-a-change-affects.md), a pull request ran only
the jobs its files affect, but every push to `main` ran all of them. A merge
therefore repeated, minutes later, the jobs its pull request had just passed:
four times in one afternoon, about two minutes each on three parallel jobs.

A merge commit made from a branch that already contains every commit of `main`
has the tree of the branch head. The pull request run checked that same tree,
because GitHub tests the merge of the head into the base, and the base adds
nothing the head does not have.

The 25 merge commits of the repository were replayed through the new
classification:

| Merge commits                                             | Result                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| 13 merges of up-to-date pull requests with a passed check | No job; in the 12 most recent, the two trees were compared and are equal |
| 9 pull requests from before `CI required` existed         | Jobs chosen by the changed files                                         |
| 3 merges whose second parent does not contain the first   | Jobs chosen by the changed files; their trees differ                     |

## Decision

- On a push, the `Changes` job reads the parents of the commit. With two
  parents, when the first has no commit missing from the second and the second
  has a successful `CI required` check, it starts no job.
- Any other push starts the jobs of the files it changed, from the compare API
  between the previous head of `main` and the new one. At the limit of files the
  API lists, it starts every job.
- Manual runs still start every job.
- The job reads commits and checks, so it also asks for `contents: read` and
  `checks: read`.

## Consequences

- A merge of an up-to-date pull request spends one short job on `main` instead
  of three full ones. `CI required` passes there with the jobs skipped.
- A pull request merged while behind `main` is still checked on `main`, by the
  files of the merge.
- `main` no longer keeps a full result for every merge; the result of an
  up-to-date merge is the one of its pull request.
- The check is by name: renaming `CI required` has to change the query in
  `ci.yml` too.
- The release pull request is opened by the workflow token, so its run waits for
  an approval. Approve it once, when the release is about to be merged.
