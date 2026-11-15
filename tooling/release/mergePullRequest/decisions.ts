import type {
  CheckDecision,
  CheckRun,
  FileCheck,
  IgnoredCheck,
  Manifest,
  MergedFiles,
  PullRequest,
  RegistryReading,
  ReviewThread,
  WorkflowRun
} from './types.ts'

type CheckRuns = {
  checkRuns: readonly CheckRun[]
  workflowRuns: readonly WorkflowRun[]
}

type CheckState = CheckRuns & {
  head: string
  approvedRuns: ReadonlySet<number>
  canApprove: boolean
}

type CountedCheck = { check: CheckRun; workflowRuns: readonly WorkflowRun[] }

type OpenThreads = { number: number; threads: readonly ReviewThread[] }

type Parents = { parents: readonly string[]; head: string; base: string }

type HeadCheck = {
  pullRequest: PullRequest
  expectedSha: string | undefined
  isDryRun: boolean
}

type RunLookup = { runs: readonly WorkflowRun[]; path: string; sha: string }

type ManifestChange = { current: Manifest; previous: Manifest }

type ReleasedVersion = { path: string; version: string }

type Publication = { reading: RegistryReading; version: string }

// The value of a path on each side; undefined when the path does not exist.
type PathSides = {
  original: string | undefined
  branch: string | undefined
  base: string | undefined
}

type MergedPath =
  | { isClean: true; file: string | undefined }
  | { isClean: false }

const RELEASE_BRANCH_PREFIX = 'release-please--'
const SHORT_SHA_LENGTH = 7
// WHY: only checks of runs started by these events count for a required check
// of a ruleset; a workflow_dispatch run reports checks that do not.
// https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
const RULESET_EVENTS = new Set([
  'push',
  'pull_request',
  'pull_request_review',
  'pull_request_target',
  'deployment',
  'deployment_status'
])
const PASSING_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])
const HELD = 'action_required'

function latest<Item extends { id: number }>(
  items: readonly Item[]
): Item | undefined {
  return items.toSorted((first, second) => second.id - first.id)[0]
}

// The file a merge gives to a path when no side has to be merged into the
// other line by line: the side that changed it, or the change both made.
function mergePath({ original, branch, base }: PathSides): MergedPath {
  if (branch === original) return { isClean: true, file: base }
  if (base === original || base === branch) {
    return { isClean: true, file: branch }
  }
  return { isClean: false }
}

function eventOf({ check, workflowRuns }: CountedCheck): string {
  return workflowRuns.find(run => run.suiteId === check.suiteId)?.event ?? ''
}

function isCounted(counted: CountedCheck): boolean {
  return RULESET_EVENTS.has(eventOf(counted))
}

// GitHub lists a held run as completed, with action_required as its
// conclusion; the status is accepted too in case that changes.
function isHeld(run: WorkflowRun): boolean {
  return run.status === HELD || run.conclusion === HELD
}

export const CI_WORKFLOW = '.github/workflows/ci.yml'

export const RELEASE_WORKFLOW = '.github/workflows/release.yml'

export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH)
}

export function refusePullRequest(
  pullRequest: PullRequest
): string | undefined {
  const { number, state, isDraft, mergeStateStatus, baseBranch } = pullRequest
  if (state !== 'OPEN') {
    return `#${number} is ${state.toLowerCase()}. Only an open pull request can be merged.`
  }
  if (isDraft) {
    return `#${number} is a draft. Mark it ready for review first.`
  }
  if (mergeStateStatus === 'DIRTY') {
    return `#${number} has conflicts with ${baseBranch}. Merge ${baseBranch} into the branch and resolve them first.`
  }
  return undefined
}

export function describeOpenThreads({ number, threads }: OpenThreads): string {
  const lines = threads.map(({ path, line, author, url }) => {
    const place = line === undefined ? path : `${path}:${line}`
    return `  ${place} by ${author}${url ? ` (${url})` : ''}`
  })
  return [
    `#${number} has ${threads.length} unresolved review conversation(s). Resolve them before merging:`,
    ...lines
  ].join('\n')
}

// Release pull requests come from the release workflow of this repository. A
// fork can use the same branch prefix, so its runs are never approved here.
export function isReleasePullRequest(pullRequest: PullRequest): boolean {
  return (
    !pullRequest.isCrossRepository &&
    pullRequest.headBranch.startsWith(RELEASE_BRANCH_PREFIX)
  )
}

// WHY: merging a release pull request publishes its versions on npm, and
// release-please rewrites it after a merge to main, so a real run of a release
// pull request needs the head that was reviewed.
export function refuseHead({
  pullRequest,
  expectedSha,
  isDryRun
}: HeadCheck): string | undefined {
  const { number, headSha } = pullRequest
  if (expectedSha === undefined) {
    return isDryRun || !isReleasePullRequest(pullRequest)
      ? undefined
      : `#${number} is a release pull request. Pass the head you reviewed with --sha; vp run release:merge ${number} --dry-run prints it.`
  }
  return expectedSha === headSha
    ? undefined
    : `The head of #${number} is ${headSha}, not ${expectedSha} as passed with --sha. Review the new commits and run vp run release:merge ${number} --dry-run again.`
}

// The update-branch API makes a merge commit whose first parent is the old head
// and whose second parent is the tip of the base.
export function isBranchUpdate({ parents, head, base }: Parents): boolean {
  const [first, second, ...others] = parents
  return first === head && second === base && others.length === 0
}

// Compares each path of the updated head with the merge of the two sides,
// counting a missing path as a value, so an added or removed file counts too.
export function checkMergedFiles({
  mergeBase,
  branch,
  base,
  updated
}: MergedFiles): FileCheck {
  const paths = new Set([
    ...mergeBase.keys(),
    ...branch.keys(),
    ...base.keys(),
    ...updated.keys()
  ])
  const check: FileCheck = { mismatched: [], changedOnBothSides: [] }
  for (const path of [...paths].toSorted()) {
    const merged = mergePath({
      original: mergeBase.get(path),
      branch: branch.get(path),
      base: base.get(path)
    })
    if (!merged.isClean) {
      check.changedOnBothSides.push(path)
    } else if (updated.get(path) !== merged.file) {
      check.mismatched.push(path)
    }
  }
  return check
}

export function mergeCommitTitle(pullRequest: PullRequest): string {
  const { number, headOwner, headBranch } = pullRequest
  return `Merge pull request #${number} from ${headOwner}/${headBranch}`
}

export function ignoredChecks({
  checkRuns,
  workflowRuns
}: CheckRuns): IgnoredCheck[] {
  return checkRuns
    .filter(check => !isCounted({ check, workflowRuns }))
    .map(check => ({
      check,
      event: eventOf({ check, workflowRuns }) || 'unknown'
    }))
}

export function decideCheck(state: CheckState): CheckDecision {
  const { head, checkRuns, workflowRuns, approvedRuns, canApprove } = state
  const check = latest(
    checkRuns.filter(candidate => isCounted({ check: candidate, workflowRuns }))
  )
  if (check) {
    if (check.status !== 'completed') return { kind: 'pending', check }
    return PASSING_CONCLUSIONS.has(check.conclusion ?? '')
      ? { kind: 'passed', check }
      : { kind: 'failed', check }
  }
  const held = workflowRuns.filter(
    run =>
      run.path === CI_WORKFLOW &&
      run.headSha === head &&
      isHeld(run) &&
      !approvedRuns.has(run.id)
  )
  if (held.length === 0) return { kind: 'missing' }
  return canApprove
    ? { kind: 'approve', runs: held }
    : { kind: 'held', runs: held }
}

export function findRun({
  runs,
  path,
  sha
}: RunLookup): WorkflowRun | undefined {
  return latest(runs.filter(run => run.path === path && run.headSha === sha))
}

export function releasedVersions({
  current,
  previous
}: ManifestChange): ReleasedVersion[] {
  return Object.entries(current)
    .filter(([path, version]) => previous[path] !== version)
    .map(([path, version]) => ({ path, version }))
}

export function isPublished({ reading, version }: Publication): boolean {
  return reading.version === version && Boolean(reading.provenance)
}
