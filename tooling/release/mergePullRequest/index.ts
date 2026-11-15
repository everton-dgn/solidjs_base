import { inspectCi, waitForCi } from './ci.ts'
import {
  describeOpenThreads,
  isReleasePullRequest,
  mergeCommitTitle,
  refuseHead,
  refusePullRequest,
  shortSha
} from './decisions.ts'
import { describePublication, verifyPublication } from './publication.ts'
import { createSession } from './session.ts'
import type {
  MergeOutcome,
  MergeRequest,
  PullRequest,
  Session
} from './types.ts'
import { updateBranch } from './update.ts'
import { readAgain } from './wait.ts'

type Step = { session: Session; pullRequest: PullRequest }

type BehindStep = Step & { behindBy: number }

type MergedStep = Step & { mergeSha: string; isDryRun: boolean }

type MergeFailure = Extract<MergeOutcome, { isMerged: false }>

type UnconfirmedMerge = Step & { head: string; failure: MergeFailure }

async function dryRun({
  session,
  pullRequest,
  behindBy
}: BehindStep): Promise<void> {
  const { log } = session.environment
  const { number, headSha, baseBranch } = pullRequest
  const title = mergeCommitTitle(pullRequest)
  if (behindBy > 0) {
    log(
      `Dry run: would merge ${baseBranch} into the branch, wait for CI required on the new head and merge #${number} at that head with the title "${title}" and an empty body.`
    )
  } else {
    await inspectCi({
      session,
      head: headSha,
      canApprove: isReleasePullRequest(pullRequest)
    })
    log(
      `Dry run: would merge #${number} at ${shortSha(headSha)} with the title "${title}" and an empty body.`
    )
  }
  if (isReleasePullRequest(pullRequest)) {
    await describePublication({
      session,
      ref: headSha,
      previousRef: baseBranch
    })
  } else {
    log('Not a release pull request: there is no publication to check.')
  }
  log(`To merge this head: vp run release:merge ${number} --sha ${headSha}`)
}

// A run that stopped after the merge, at a timeout or a failed read, cannot
// merge again, so a merged release pull request goes to the publication check.
async function checkMergedRelease({
  session,
  pullRequest,
  mergeSha,
  isDryRun
}: MergedStep): Promise<void> {
  const { log } = session.environment
  log(
    `#${pullRequest.number} was merged as ${shortSha(mergeSha)}. Checking its publication only.`
  )
  if (isDryRun) {
    await describePublication({
      session,
      ref: mergeSha,
      previousRef: `${mergeSha}^1`
    })
    return
  }
  await verifyPublication({ session, sha: mergeSha })
  log('The release is published.')
}

// WHY: GitHub may have accepted a merge that timed out or got an HTTP 5xx, and
// sending it again is not safe, so the pull request is read instead.
async function confirmMerge({
  session,
  pullRequest,
  head,
  failure
}: UnconfirmedMerge): Promise<string> {
  const { number } = pullRequest
  const unconfirmed = `GitHub did not confirm the merge of #${number}: ${failure.message}`
  if (!failure.isUncertain) throw new Error(unconfirmed)
  session.environment.log(`${unconfirmed} Reading #${number} again.`)
  let state: string
  try {
    const current = await readAgain({
      session,
      read: () => session.github.readPullRequest(number)
    })
    if (current.state === 'MERGED' && current.mergeSha !== undefined) {
      return current.mergeSha
    }
    state = `#${number} is ${current.state.toLowerCase()}`
  } catch (error) {
    state = error instanceof Error ? error.message : String(error)
  }
  throw new Error(
    [
      unconfirmed,
      `${state}, and the merge was not sent again. GitHub may still merge it. Run the command again, which reads the pull request first:`,
      `  vp run release:merge ${number} --sha ${head}`
    ].join('\n')
  )
}

export async function mergePullRequest(request: MergeRequest): Promise<void> {
  const { number, expectedSha, isDryRun, timing, environment } = request
  const { log } = environment
  const session = createSession({ environment, timing, isDryRun })
  const pullRequest = await session.github.readPullRequest(number)
  const { state, mergeSha } = pullRequest
  if (
    state === 'MERGED' &&
    mergeSha !== undefined &&
    isReleasePullRequest(pullRequest)
  ) {
    await checkMergedRelease({ session, pullRequest, mergeSha, isDryRun })
    return
  }
  const refusal =
    refusePullRequest(pullRequest) ??
    refuseHead({ pullRequest, expectedSha, isDryRun })
  if (refusal) throw new Error(refusal)
  const { title, headOwner, headBranch, headSha, baseBranch } = pullRequest
  log(`#${number} ${title}`)
  log(`Head: ${headOwner}:${headBranch} at ${headSha}.`)
  const threads = await session.github.listOpenThreads(number)
  if (threads.length > 0) {
    throw new Error(describeOpenThreads({ number, threads }))
  }
  log('No unresolved review conversation.')
  const comparison = await session.github.compare({
    base: baseBranch,
    head: headSha
  })
  const { behindBy } = comparison
  log(
    behindBy > 0
      ? `The branch is ${behindBy} commit(s) behind ${baseBranch}.`
      : `The branch is up to date with ${baseBranch}.`
  )
  if (isDryRun) {
    await dryRun({ session, pullRequest, behindBy })
    return
  }
  const head =
    behindBy > 0
      ? await updateBranch({ session, pullRequest, comparison })
      : headSha
  // WHY: a held run is approved only on the head passed with --sha, or on the
  // merge of the base into it that updateBranch verified.
  const canApprove =
    isReleasePullRequest(pullRequest) && expectedSha === headSha
  await waitForCi({ session, head, canApprove })
  const outcome = await session.github.merge({
    number,
    sha: head,
    title: mergeCommitTitle(pullRequest)
  })
  const mergeCommit = outcome.isMerged
    ? outcome.sha
    : await confirmMerge({ session, pullRequest, head, failure: outcome })
  log(`Merged #${number} as ${shortSha(mergeCommit)}.`)
  if (!isReleasePullRequest(pullRequest)) {
    log('Not a release pull request: there is no publication to check.')
    return
  }
  await verifyPublication({ session, sha: mergeCommit })
  log('The release is published.')
}
