import { inspectCi, waitForCi } from './ci.ts'
import {
  describeOpenThreads,
  isBranchUpdate,
  isReadCommand,
  isReleasePullRequest,
  mergeCommitTitle,
  refuseHead,
  refusePullRequest,
  shortSha
} from './decisions.ts'
import { createGitHub } from './github.ts'
import { describePublication, verifyPublication } from './publication.ts'
import { createRegistry } from './registry.ts'
import type { MergeRequest, PullRequest, RunCommand, Session } from './types.ts'
import { describeDuration, waitFor } from './wait.ts'

type Step = { session: Session; pullRequest: PullRequest }

type BehindStep = Step & { behindBy: number }

type UpdateStep = Step & { baseSha: string }

type MergedStep = Step & { mergeSha: string; isDryRun: boolean }

// The dry run builds the same commands as a real run, so a write that slips
// through a branch of the flow fails here instead of reaching GitHub.
function refuseWrites(run: RunCommand): RunCommand {
  return command =>
    isReadCommand(command)
      ? run(command)
      : Promise.reject(
          new Error(
            `The dry run refused to run "${command.file} ${command.args.join(' ')}".`
          )
        )
}

async function updateBranch({
  session,
  pullRequest,
  baseSha
}: UpdateStep): Promise<string> {
  const { log } = session.environment
  const { number, headSha, baseBranch } = pullRequest
  log(`Merging ${baseBranch} into the branch, never rebasing it.`)
  await session.github.updateBranch({ number, head: headSha })
  const head = await waitFor({
    session,
    timeout: session.timing.checkTimeout,
    describeTimeout: () =>
      `The head of #${number} did not change within ${describeDuration(session.timing.checkTimeout)} after the update.`,
    attempt: async () => {
      const current = await session.github.readPullRequest(number)
      return current.headSha === headSha ? undefined : current.headSha
    }
  })
  const parents = await session.github.readParents(head)
  if (!isBranchUpdate({ parents, head: headSha, base: baseSha })) {
    throw new Error(
      `The new head ${head} of #${number} is not the merge of ${baseBranch} at ${baseSha} into ${headSha}: its parents are ${parents.join(' and ') || 'none'}. Nothing was approved or merged. Review the new head and run vp run release:merge ${number} --dry-run again.`
    )
  }
  log(
    `New head: ${head}, the merge of ${baseBranch} at ${shortSha(baseSha)} into ${shortSha(headSha)}. A second run takes it with --sha.`
  )
  return head
}

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

export async function mergePullRequest(request: MergeRequest): Promise<void> {
  const { number, expectedSha, isDryRun, timing, environment } = request
  const { log } = environment
  const run = isDryRun ? refuseWrites(environment.run) : environment.run
  const session: Session = {
    timing,
    environment,
    github: createGitHub(run),
    registry: createRegistry(run)
  }
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
  const { behindBy, baseSha } = await session.github.compare({
    base: baseBranch,
    head: headSha
  })
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
      ? await updateBranch({ session, pullRequest, baseSha })
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
  if (!outcome.isMerged) {
    throw new Error(
      `GitHub did not confirm the merge of #${number}: ${outcome.message}`
    )
  }
  log(`Merged #${number} as ${shortSha(outcome.sha)}.`)
  if (!isReleasePullRequest(pullRequest)) {
    log('Not a release pull request: there is no publication to check.')
    return
  }
  await verifyPublication({ session, sha: outcome.sha })
  log('The release is published.')
}
