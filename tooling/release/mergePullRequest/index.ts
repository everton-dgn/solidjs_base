import { inspectCi, waitForCi } from './ci.ts'
import {
  describeOpenThreads,
  isReleasePullRequest,
  mergeCommitTitle,
  refusePullRequest,
  shortSha
} from './decisions.ts'
import { createGitHub } from './github.ts'
import { describePublication, verifyPublication } from './publication.ts'
import { createRegistry } from './registry.ts'
import type {
  Command,
  MergeRequest,
  PullRequest,
  RunCommand,
  Session
} from './types.ts'
import { describeDuration, waitFor } from './wait.ts'

type Step = { session: Session; pullRequest: PullRequest }

type BehindStep = Step & { behindBy: number }

const READ_METHODS = new Set(['GET'])

function isReadCommand({ file, args }: Command): boolean {
  if (file === 'npm') return args[0] === 'view'
  if (args[0] === 'pr') return args[1] === 'view'
  const method = args.indexOf('-X')
  return (
    args[0] === 'api' &&
    (method === -1 || READ_METHODS.has(args[method + 1] ?? ''))
  )
}

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

async function updateBranch({ session, pullRequest }: Step): Promise<string> {
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
  log(`New head: ${shortSha(head)}.`)
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
    await inspectCi({ session, pullRequest, head: headSha })
    log(
      `Dry run: would merge #${number} at ${shortSha(headSha)} with the title "${title}" and an empty body.`
    )
  }
  if (!isReleasePullRequest(pullRequest)) {
    log('Not a release pull request: there is no publication to check.')
    return
  }
  await describePublication({ session, ref: headSha, previousRef: baseBranch })
}

export async function mergePullRequest(request: MergeRequest): Promise<void> {
  const { number, isDryRun, timing, environment } = request
  const { log } = environment
  const run = isDryRun ? refuseWrites(environment.run) : environment.run
  const session: Session = {
    timing,
    environment,
    github: createGitHub(run),
    registry: createRegistry(run)
  }
  const pullRequest = await session.github.readPullRequest(number)
  const refusal = refusePullRequest(pullRequest)
  if (refusal) throw new Error(refusal)
  const { title, headOwner, headBranch, headSha, baseBranch } = pullRequest
  log(`#${number} ${title}`)
  log(`Head: ${headOwner}:${headBranch} at ${shortSha(headSha)}.`)
  const threads = await session.github.listOpenThreads(number)
  if (threads.length > 0) {
    throw new Error(describeOpenThreads({ number, threads }))
  }
  log('No unresolved review conversation.')
  const behindBy = await session.github.countBehind({
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
    behindBy > 0 ? await updateBranch({ session, pullRequest }) : headSha
  await waitForCi({ session, pullRequest, head })
  const outcome = await session.github.merge({
    number,
    sha: head,
    title: mergeCommitTitle(pullRequest)
  })
  if (!outcome.isMerged) {
    throw new Error(
      `GitHub refused the merge of #${number}: ${outcome.message}`
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
