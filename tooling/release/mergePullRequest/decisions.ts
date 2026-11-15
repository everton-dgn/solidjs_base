import type {
  CheckDecision,
  CheckRun,
  IgnoredCheck,
  Manifest,
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

type RunLookup = { runs: readonly WorkflowRun[]; path: string; sha: string }

type ManifestChange = { current: Manifest; previous: Manifest }

type ReleasedVersion = { path: string; version: string }

type Publication = { reading: RegistryReading; version: string }

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

function latest<Item extends { id: number }>(
  items: readonly Item[]
): Item | undefined {
  return items.toSorted((first, second) => second.id - first.id)[0]
}

function eventOf({ check, workflowRuns }: CountedCheck): string {
  return workflowRuns.find(run => run.suiteId === check.suiteId)?.event ?? ''
}

function isCounted(counted: CountedCheck): boolean {
  return RULESET_EVENTS.has(eventOf(counted))
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
      run.status === 'action_required' &&
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
