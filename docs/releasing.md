# Releasing

Each package has its own version, in its `package.json`, and is published on its
own to the public npm registry under the `@evertondgn` scope. The workspace root
is private and is never published.

[release-please](https://github.com/googleapis/release-please) derives the
versions from Conventional Commits. It runs only in CI, from
`.github/workflows/release.yml`, and is not a dependency of the project.

1. A commit on `main` that changes files of a package goes into the next version
   of that package. The package is found by the folder of the changed files. The
   commit scope (`feat(tooling): ...`) is only for people reading the history.
2. The packages share one version number. When a commit releases one of them,
   release-please raises both to the same version (`linked-versions`), so a
   package can get a version without changes of its own.
3. The workflow keeps one release pull request open for both packages, with the
   new version and the `CHANGELOG.md` of each.
4. Merging that pull request creates one tag for each package, such as
   `solid-tooling@0.7.0` and `solid-runtime@0.7.0`, and their GitHub Releases.
   The workflow then validates the workspace, packs each package and publishes
   it.

The workflow runs release-please in two jobs. `Tags and GitHub Releases` uses
the workflow's `GITHUB_TOKEN` and only creates the tags and GitHub Releases of a
merged release pull request. `Release pull request` runs after it, so the new
tags exist when it computes the next release, and only opens or updates the
release pull request, with a token of a GitHub App
([One-time setup](#one-time-setup)). The publish job does not wait for it.

GitHub holds the CI runs of a pull request that a workflow opens or updates with
the `GITHUB_TOKEN` until someone approves them, and starts them at once when the
token comes from a GitHub App
([GitHub docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)).
So the CI of the release pull request starts on its own, and `CI required` has
to pass before the merge, as in any other pull request. release-please rewrites
the release pull request after every merge that changes the next version, and
each rewrite starts a new run.

The publish step uses no token. npm authenticates the workflow through OIDC
([trusted publishing](https://docs.npmjs.com/trusted-publishers)) and attaches
the build provenance to the version.

| Commit                                              | Bump below 1.0.0        |
| --------------------------------------------------- | ----------------------- |
| `fix`                                               | Patch                   |
| `feat`                                              | Minor                   |
| `!` in the header or `BREAKING CHANGE:` in a footer | Minor                   |
| Other types (`chore`, `docs`, `test`, `refactor`)   | No release on their own |

The breaking change marker wins over the type: a `chore!` commit raises the
version too. From 1.0.0 on, a breaking change raises the major version.

## Merging a pull request

Merge every pull request, release pull requests included, with a merge commit
and an empty commit body. Run the command at the root, with `gh` signed in to an
account that can merge. It needs `gh` 2.48.0 or later, the first with
`gh api --slurp`, which it uses to read every page of a list:

```bash
vp run release:merge <number> --dry-run
vp run release:merge <number> --sha <head>
```

`--dry-run` reads the state and prints what the command would do, without
updating the branch, approving a run or merging. It ends with the command to
merge, with the full head it read. Review that head and pass it with `--sha`:
the command stops when the pull request has another head, such as a commit
pushed or a release pull request written again after the review. `--sha` is
required for a release pull request, because merging it publishes the packages
on npm, and optional for the others. Without `--dry-run`, the command:

1. Refuses a pull request that is closed, a draft or in conflict, one whose head
   is not the one passed with `--sha`, and one with an unresolved review
   conversation, which it lists with the path, the line and the author.
2. Merges the base branch, `main` here, into a branch that is behind, through
   the GitHub API and never with a rebase, and prints the new head. It goes on
   only when the new head is a merge commit whose parents are the reviewed head
   and the tip of the base it read before the update, and when each of its files
   is the one a merge of the two sides gives: the version of the side that
   changed the file since their merge base, or the change both sides made. It
   compares the file lists of the four commits and stops, before approving or
   merging anything, when a file differs, when both sides changed a file in
   different ways, which only a review can check, or when GitHub truncates a
   file list. The message gives the reason and the command that merges the new
   head once you have reviewed it.
3. Waits for `CI required` on the head. It counts only the checks of runs
   started by an event the ruleset accepts, such as `pull_request`, and ignores
   the check of a `workflow_dispatch` run. A CI run that waits for an approval
   is left only on a release pull request opened before the GitHub App
   ([When a CI run of the release pull request waits for an approval](#when-a-ci-run-of-the-release-pull-request-waits-for-an-approval)).
   When the check is missing and the run of that head waits, the command
   approves that run, and only that one, if the pull request is a release pull
   request from a branch of this repository. For any other pull request it
   stops, so you review the changes and approve the run on GitHub.
4. Merges with `sha` set to that head, so GitHub refuses the merge when the head
   changed in the meantime, and checks that the API answered `merged: true`.
   GitHub may have merged a pull request when the merge call stops at the time
   limit or gets an HTTP 5xx answer, so the command reads the pull request
   instead of sending the merge again. It goes on when the pull request is
   merged, and otherwise stops, saying that the merge was not confirmed; a
   second run reads the pull request first.
5. For a release pull request, waits for the `Release` workflow of the merge
   commit, prints the result of each job and checks that each released version
   is on npm with its provenance statement. It reads the versions from
   `.release-please-manifest.json` and the names from the package `package.json`
   at the merge commit. It follows the conclusion of the whole run, so when only
   the `Release pull request` job fails, it stops before checking npm, although
   the packages may be published. Fix that job
   ([When the release pull request job fails](#when-the-release-pull-request-job-fails))
   and run the command again.

For a release pull request that is already merged, the command runs only the
last step, with its merge commit and without `--sha`. Run it again when the
first run stopped after the merge, at a timeout or a failed read.

Every refusal or failure ends with a message and a nonzero exit code. A `gh` or
`npm` call that does not finish within 2 minutes is stopped and counts as a
failed call. While the command waits, a `gh` read that fails with an HTTP 5xx or
429 answer, a rate limit message, a network error or that stop is read again at
the next interval, until the wait times out. A read that follows a write, such
as the commit and the files of the new head after the update or the manifest
after the merge, is read again the same way for up to 2 minutes. A failed
`npm view`, whatever the error, an authentication error included, counts as a
version not on npm yet and is read again until `--registry-timeout`. Any other
failed call ends the command, and a failed write is never repeated.
`--interval <seconds>` sets the time between two reads (30 by default),
`--timeout <minutes>` the longest wait for the new head after an update, for
`CI required` and for the `Release` workflow (60), and
`--registry-timeout <minutes>` the longest wait for each version on npm (10).
The command lives in `tooling/release/`, and `vp run test:release` runs its
tests.

Without the command, read the head and merge through the API. With `sha`, GitHub
refuses the merge when the head changed after the review and the CI run:

```bash
gh pr view <number> --json headRefOid,headRepositoryOwner,headRefName
gh api -X PUT repos/everton-dgn/solidjs_base/pulls/<number>/merge \
  -f merge_method=merge \
  -f sha=<head-sha> \
  -f commit_title='Merge pull request #<number> from <owner>/<branch>' \
  -f commit_message='' --jq .merged
```

The last command prints `true` when the merge happened. The merge button writes
the pull request title into the merge commit, and release-please reads a title
such as `feat: ...` as one more changelog entry ([Known limits](#known-limits)).

The `main` ruleset requires a branch that is up to date and has no open
conversation. When GitHub reports the pull request behind `main`, merge `main`
into the branch, never rebase it, and wait for `CI required` again.

## Before merging a release pull request

1. Read the version and the `CHANGELOG.md` in the diff. The entries are the
   messages of the commits that reached `main`, and the breaking change notes
   are their footers as written. Together they must describe the change from the
   last published version. A branch that changed the same option more than once
   publishes every footer, and a pull request merged with the merge button adds
   its title as an entry.
2. Do not merge notes that give wrong or contradictory migration steps, or an
   entry that should not exist and raises the version, such as the title of a
   pull request merged with the merge button. Fix the entry in the
   `CHANGELOG.md` of the release branch and write the same text in the pull
   request body, which becomes the GitHub Release notes. Push from your account
   with the commands of
   [When the release pull request has a conflict](#when-the-release-pull-request-has-a-conflict),
   right before merging: release-please writes the pull request again, and
   discards the edit, when a new merge changes the release it computes. Editing
   the notes does not change the version. When the version is wrong too, do not
   edit `package.json` or the manifest by hand: merge a pull request that sets
   `release-as` for both packages in `release-please-config.json`, let
   release-please write the release pull request again, and remove `release-as`
   after the release.
3. For the first automated release of a package, create the trusted publisher
   now
   ([First automated release of a package](#first-automated-release-of-a-package)).
4. Merge with `vp run release:merge <number> --sha <head>`
   ([Merging a pull request](#merging-a-pull-request)), with the head whose
   version and `CHANGELOG.md` you read; `--dry-run` prints it. It waits for
   `CI required`, merges, waits for the `Release` workflow and checks each
   released version on npm. When release-please writes the pull request again
   after your review, the head changes and the command stops: read the new diff
   and start from step 1. On a release pull request opened before the GitHub
   App, whose CI run waits for an approval, the command approves the run of that
   head
   ([When a CI run of the release pull request waits for an approval](#when-a-ci-run-of-the-release-pull-request-waits-for-an-approval)).
5. Without the command, wait for `CI required`, merge with the API call of the
   same section and, after the publish job, check the registry. The version can
   take a few minutes to appear, and the output has the version and the
   provenance statement:

   ```bash
   npm view @evertondgn/<package>@<version> version dist.attestations.provenance --json
   ```

## Fixing the notes of a published version

For an error found after the release. The packages do not ship `CHANGELOG.md`,
so the published package does not change.

1. Edit the GitHub Release of the tag with
   `gh release edit <tag> --notes-file <file>`.
2. Fix the same entry in the package `CHANGELOG.md` with a `docs` pull request.
   A `docs` commit does not start a release. The file exists after the first
   automated release of the package.

## Configuration files

- `release-please-config.json` lists the packages and the rules. A new package
  goes under `packages`, keyed by its folder, and its component goes into the
  `linked-versions` group. `release-as` under both packages sets the next
  version by hand; remove it after that release, or release-please keeps
  proposing it.
- `.release-please-manifest.json` holds the last released version of each
  package. release-please updates it. Edit it by hand only to add a package that
  already has a published version.

## One-time setup

On GitHub, the `Release pull request` job needs a GitHub App that opens the
release pull request. Create it in Settings > Developer settings > GitHub Apps >
New GitHub App, on the account that owns the repository:

- Any name and homepage URL. Turn off the webhook (uncheck **Active**), and keep
  the App installable only on this account.
- Repository permissions: Contents, Issues and Pull requests, each with read and
  write access. The job asks for exactly these.
- After saving, generate a private key on the App page, then install the App on
  this repository only (Install App > Only select repositories).

In the repository, under Settings > Secrets and variables > Actions, save:

| Kind     | Name                      | Value                                            |
| -------- | ------------------------- | ------------------------------------------------ |
| Variable | `RELEASE_APP_CLIENT_ID`   | The Client ID shown on the App page              |
| Secret   | `RELEASE_APP_PRIVATE_KEY` | The whole content of the private key `.pem` file |

To use the same App in another repository, install the App on that repository
too and save the variable and the secret there. The private key belongs to the
App, not to one installation: a workflow that reads the secret can ask for a
token for every repository the App is installed on. Share the App only between
repositories with the same maintainers, and create another App otherwise.

No job opens a pull request with the `GITHUB_TOKEN`, so the release does not
need "Allow GitHub Actions to create and approve pull requests" in Settings >
Actions > General.

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

## New package

A trusted publisher is created in the settings of a package, so the package has
to exist on the registry first. Publish the first version of each package
[by hand](#publishing-by-hand). The workflow publishes the following ones.

The order matters when a new package arrives in the same pull request that adds
it to `release-please-config.json` and `.release-please-manifest.json`, as
`@evertondgn/solid-runtime` did at `0.1.0`:

1. Publish the version in the manifest by hand, from the last commit of the pull
   request.
2. Create the tag on that commit, such as `solid-runtime@0.1.0`, and push it.
3. Merge the pull request. release-please finds the tag and opens no release
   pull request for the package until a later `fix` or `feat` changes it.

release-please finds the previous version of a package through its GitHub
Release or, failing that, its tag. Merging first leaves neither, so it collects
the commits back to `bootstrap-sha` and proposes a release with the whole
history of the package.

## First automated release of a package

The package must already be on npm, as described above. A new trusted publisher
expires if the workflow does not publish with it within two days, so create it
only when a release is ready:

1. Wait for release-please to open the release pull request. It opens after a
   `fix` or `feat` for any package of the group reaches `main`, and is titled
   `chore: release main`, on the branch `release-please--branches--main`.
2. Create the trusted publisher on npmjs.com, with the values in
   [One-time setup](#one-time-setup).
3. Merge the release pull request within two days.

If the trusted publisher expires, delete it and create another one.

## When the release pull request has a conflict

A pull request merged after release-please opened the release pull request can
touch the lines it changes. In the package `package.json`, the `description`
sits next to the `version`, so a new description is enough. release-please
rewrites the release pull request only when the release it computes changes, so
the conflict stays: the `Release pull request` job logs that the pull request
"remained the same".

Merge `main` into the release branch, keeping the version and changelog of the
release and the changes from `main`. Do not rebase the branch.

```bash
git fetch origin
git switch --detach origin/<release-branch>
git merge origin/main
# Resolve the conflict, then: git add <file> && git commit --no-edit
git diff --stat origin/main HEAD
git push origin HEAD:<release-branch>
```

The `git diff` must list only `.release-please-manifest.json` and, for each
package, its `CHANGELOG.md` and `package.json`. The push starts the CI of the
release pull request. Merge it after `CI required` passes, with the command in
[Merging a pull request](#merging-a-pull-request).

## When the release pull request job fails

The tags, the GitHub Releases and the publication do not depend on the
`Release pull request` job: when it fails, only the release pull request is not
opened or updated. The job fails in the `Create the App token` step, and the log
tells the cause:

| Log                                                        | Cause                                           | Fix                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `The 'client-id' ... input must be set`                    | The `RELEASE_APP_CLIENT_ID` variable is missing | Save the variable again                                                        |
| `The 'private-key' input must be set`                      | The `RELEASE_APP_PRIVATE_KEY` secret is missing | Generate a private key on the App page and save the secret                     |
| A `404` when the action looks for the App installation     | The App is not installed on the repository      | Install it again (Install App > Only select repositories)                      |
| An authentication error when the action asks for the token | The key was deleted or belongs to another App   | Generate a private key on the App page, save the secret and delete the old key |

The values come from [One-time setup](#one-time-setup). After the fix, run the
job again; a later push to `main` runs it too:

```bash
gh run view <run-id> --json jobs --jq '.jobs[] | {name, databaseId}'
gh run rerun --job <database-id>
```

The rerun runs only that job: no job depends on it, and
`Tags and GitHub Releases` keeps its outputs from the first attempt
([GitHub docs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)).
Nothing is tagged or published again.

The job can also pass without opening or updating the release pull request. When
its log says `There are untagged, merged release PRs outstanding - aborting`, a
merged release pull request still has the `autorelease: pending` label, so
release-please waits for its tags. If the tags and GitHub Releases of that pull
request exist, swap the label for `autorelease: tagged` and run the job again.
The message "remained the same" is another case: the release did not change, so
the pull request was left as it was.

## When a CI run of the release pull request waits for an approval

GitHub holds the run only when a workflow opened or updated the pull request
with the `GITHUB_TOKEN`, as `github-actions[bot]`. The `Release pull request`
job never does that, so this is left for a release pull request from before the
App. `vp run release:merge <number> --sha <head>` approves the held run of that
head. Without the command, approve the held run of the head you are about to
merge. An approved run starts every job:

```bash
gh pr view <number> --json headRefName,headRefOid
gh run list --branch <release-branch> \
  --status action_required --json databaseId,workflowName,headSha
gh api -X POST repos/everton-dgn/solidjs_base/actions/runs/<run-id>/approve
```

A run started with `workflow_dispatch` on the release branch does not replace
the approval: the `main` ruleset only counts checks of runs started by events
such as `pull_request` and `push`
([GitHub docs](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)).
A commit pushed to the release branch from your account also starts the CI
without the approval.

## When the publish job fails

The `Tags and GitHub Releases` job runs before the publish job. If publishing
fails, the tag and the GitHub Release already exist. Pushing a new commit does
not publish the version: release-please finds the tag and creates no release, so
the publish job is skipped.

npm can accept the upload even when the job reports a failure, so first check
whether the version is on the registry:

```bash
npm view @evertondgn/solid-tooling@0.2.0 version
```

If it prints the version, there is nothing to recover. Otherwise, keep in mind
that a re-run checks out the same commit as the failed run, so a fix pushed to
the repository does not reach it. What to do depends on where the cause is:

- On npmjs.com, such as a missing or expired trusted publisher, or a field that
  does not match the table in [One-time setup](#one-time-setup): fix it there,
  then open the failed run on GitHub and choose "Re-run failed jobs". The
  publish job runs again with the output of the `Tags and GitHub Releases` job
  from the first attempt. GitHub allows this for 30 days.
- Outside the package folder, such as a workflow step or the workspace
  configuration that validation uses: open the fix as a pull request, keep it
  unmerged, and
  [publish the same version again](#publishing-a-failed-version-again).
- In the package folder, when validation fails on the package code: do not
  publish the tag, because it holds code that did not pass. The fix ships as the
  next version, and the failed version is never published.

## Publishing a failed version again

The publish job builds the commit that started the workflow run, not the commit
of the tag. So once a fix outside the package folder is ready, the workflow can
publish the failed version, as long as the package folder did not change since
the release. `0.2.0` was published this way after validation rejected the
changelog that release-please had generated.

1. Open the fix as a pull request and keep it unmerged.
2. Check that the package folder and the root `package.json` are the same in the
   tag, in `main` and in the fix branch. The root `package.json` holds the
   catalog versions that `vp pm pack` writes into the published manifest. Both
   commands must print nothing:

   ```bash
   git fetch origin
   git diff --stat solid-tooling@0.2.0 origin/main -- packages/solid-tooling package.json
   git diff --stat origin/main...origin/<fix-branch> -- packages/solid-tooling package.json
   ```

3. Delete the GitHub Release and the tag:

   ```bash
   gh release delete solid-tooling@0.2.0 --cleanup-tag --yes
   ```

4. On the release pull request that was merged, swap the release-please label:

   ```bash
   gh pr edit <release-pr> --remove-label "autorelease: tagged" --add-label "autorelease: pending"
   ```

5. Merge the fix. The push to `main` runs the workflow: release-please creates
   the tag on the merge commit of the release pull request and the GitHub
   Release again, and the publish job validates and publishes the version.

Run steps 3 to 5 together. Any push to `main` after step 4 starts the release,
and if the fix is not on `main` yet, the publish job fails again. release-please
writes the release notes again from the release pull request, so copy them
before step 3 if someone edited them on GitHub.

## Known limits

`bun.lock` records the version of each workspace package, and release-please
does not update it. After a release the line stays one version behind until the
next `vp install`, which fixes it. The frozen-lockfile install in CI does not
fail because of this.

release-please writes `CHANGELOG.md` in its own format, so the workspace format
check skips every `CHANGELOG.md`. Edit those files by hand only to fix an entry,
never to reformat them.

GitHub always puts the pull request title in a merge commit, either in its title
or in its body, and release-please reads it as one more commit. A merged pull
request titled `feat` or `fix` therefore adds its title to the changelog, next
to the entries of its own commits. No repository setting removes it. The command
in [Merging a pull request](#merging-a-pull-request) leaves it out: the GitHub
API keeps the classic title and writes no body.

## Publishing by hand

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
