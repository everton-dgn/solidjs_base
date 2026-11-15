import { checkMergedFiles, isBranchUpdate, shortSha } from './decisions.ts'
import type { Comparison, PullRequest, Session } from './types.ts'
import { describeDuration, readAgain, waitFor } from './wait.ts'

type UpdateStep = {
  session: Session
  pullRequest: PullRequest
  comparison: Comparison
}

type UpdatedHead = UpdateStep & { head: string }

type UncheckedHead = { number: number; head: string; problems: string[] }

const LISTED_PATHS = 10

function listPaths(paths: readonly string[]): string {
  const listed = paths.slice(0, LISTED_PATHS).join(', ')
  const others = paths.length - LISTED_PATHS
  return others > 0 ? `${listed} and ${others} more` : listed
}

function describeUncheckedHead({
  number,
  head,
  problems
}: UncheckedHead): string {
  return [
    `The command could not confirm what the new head ${head} of #${number} holds:`,
    ...problems.map(problem => `  ${problem}`),
    'Nothing was approved or merged. Review the new head and merge it with:',
    `  vp run release:merge ${number} --sha ${head}`
  ].join('\n')
}

// WHY: the parents alone do not prove the content; a commit pushed with the
// same parents could carry other changes. Each file of the new head has to be
// the one a merge of the two sides gives.
async function findFileProblems({
  session,
  pullRequest,
  comparison,
  head
}: UpdatedHead): Promise<string[]> {
  const { github } = session
  const { headSha, baseBranch } = pullRequest
  const { baseSha, mergeBaseSha } = comparison
  const trees = await readAgain({
    session,
    read: () =>
      Promise.all([
        github.readTree(mergeBaseSha),
        github.readTree(headSha),
        github.readTree(baseSha),
        github.readTree(head)
      ])
  })
  const truncated = trees.filter(tree => tree.isTruncated)
  if (truncated.length > 0) {
    return [
      `GitHub truncated the file list of ${truncated.map(tree => tree.sha).join(', ')}, so the files cannot be compared.`
    ]
  }
  const [mergeBase, branch, base, updated] = trees
  const check = checkMergedFiles({
    mergeBase: mergeBase.files,
    branch: branch.files,
    base: base.files,
    updated: updated.files
  })
  return [
    ...(check.mismatched.length > 0
      ? [
          `Files that differ from the merge of ${baseBranch} at ${shortSha(baseSha)} into ${shortSha(headSha)}: ${listPaths(check.mismatched)}.`
        ]
      : []),
    ...(check.changedOnBothSides.length > 0
      ? [
          `Files that ${baseBranch} and the branch both changed, which the command cannot check: ${listPaths(check.changedOnBothSides)}.`
        ]
      : [])
  ]
}

async function findUpdateProblems(updated: UpdatedHead): Promise<string[]> {
  const { session, pullRequest, comparison, head } = updated
  const { headSha, baseBranch } = pullRequest
  const { baseSha } = comparison
  const parents = await readAgain({
    session,
    read: () => session.github.readParents(head)
  })
  if (!isBranchUpdate({ parents, head: headSha, base: baseSha })) {
    return [
      `Its parents are ${parents.join(' and ') || 'none'}, not ${headSha} and ${baseBranch} at ${baseSha}.`
    ]
  }
  return findFileProblems(updated)
}

export async function updateBranch(step: UpdateStep): Promise<string> {
  const { session, pullRequest, comparison } = step
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
  log(`New head: ${head}. Checking it before anything is approved or merged.`)
  let problems: string[]
  try {
    problems = await findUpdateProblems({ ...step, head })
  } catch (error) {
    problems = [error instanceof Error ? error.message : String(error)]
  }
  if (problems.length > 0) {
    throw new Error(describeUncheckedHead({ number, head, problems }))
  }
  log(
    `${shortSha(head)} is the merge of ${baseBranch} at ${shortSha(comparison.baseSha)} into ${shortSha(headSha)}, with the files of both sides. A second run takes it with --sha.`
  )
  return head
}
