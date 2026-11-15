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

The release pull request is opened with the workflow's `GITHUB_TOKEN`, so GitHub
holds its CI runs until someone with write access selects **Approve workflows to
run** in the pull request
([GitHub docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)).
`CI required` has to pass before the merge, as in any other pull request. A
commit pushed to the release branch from a person's account starts the CI at
once, without the approval.

A run started with `workflow_dispatch` on the release branch does not replace
the approval: the `main` ruleset only counts checks of runs started by events
such as `pull_request` and `push`
([GitHub docs](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)).

release-please rewrites the release pull request after every merge that changes
the next version, and each rewrite holds a new run. Approve only the run of the
head you are about to merge: an approved run starts every job.

From a terminal, list the held runs and approve the one of that head:

```bash
gh pr view <number> --json headRefName,headRefOid
gh run list --branch <release-branch> \
  --status action_required --json databaseId,workflowName,headSha
gh api -X POST repos/everton-dgn/solidjs_base/actions/runs/<run-id>/approve
```

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
through the GitHub API and an empty commit body. With `sha`, GitHub refuses the
merge when the head changed after the review and the CI run:

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
4. Approve only the held run of the head you are about to merge and wait for
   `CI required`. A push from your account starts the CI without the approval.
5. Merge with the command in [Merging a pull request](#merging-a-pull-request).
6. After the publish job, check the registry. The version can take a few minutes
   to appear, and the output has the version and the provenance statement:

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
the conflict stays: the release job logs that the pull request "remained the
same".

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
package, its `CHANGELOG.md` and `package.json`. The push comes from your
account, so the CI of the release pull request starts without **Approve
workflows to run**. Merge the release pull request after `CI required` passes,
with the command in [Merging a pull request](#merging-a-pull-request).

## When the publish job fails

The release job runs before the publish job. If publishing fails, the tag and
the GitHub Release already exist. Pushing a new commit does not publish the
version: release-please finds the tag and creates no release, so the publish job
is skipped.

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
  publish job runs again with the output of the release job from the first
  attempt. GitHub allows this for 30 days.
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
