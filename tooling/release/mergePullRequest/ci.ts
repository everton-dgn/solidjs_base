import {
  decideCheck,
  ignoredChecks,
  isReleasePullRequest,
  shortSha
} from './decisions.ts'
import type {
  CheckDecision,
  CheckRun,
  PullRequest,
  Session,
  WorkflowRun
} from './types.ts'
import { describeDuration, waitFor } from './wait.ts'

type CiStep = { session: Session; pullRequest: PullRequest; head: string }

type CiReading = CiStep & {
  approvedRuns: ReadonlySet<number>
  reportedChecks: Set<number>
}

async function readCi(reading: CiReading): Promise<CheckDecision> {
  const { session, pullRequest, head, approvedRuns, reportedChecks } = reading
  const [checkRuns, workflowRuns] = await Promise.all([
    session.github.listCheckRuns(head),
    session.github.listWorkflowRuns(head)
  ])
  for (const { check, event } of ignoredChecks({ checkRuns, workflowRuns })) {
    if (!reportedChecks.has(check.id)) {
      reportedChecks.add(check.id)
      session.environment.log(
        `Ignoring CI required from a ${event} run, which does not count for the ruleset: ${check.url}`
      )
    }
  }
  return decideCheck({
    head,
    checkRuns,
    workflowRuns,
    approvedRuns,
    canApprove: isReleasePullRequest(pullRequest)
  })
}

function failedMessage(check: CheckRun): string {
  return `CI required ended as ${check.conclusion ?? check.status}: ${check.url}`
}

function heldMessage(runs: readonly WorkflowRun[]): string {
  const urls = runs.map(run => `  ${run.url}`)
  return [
    'The CI run of this head waits for approval, and only the runs of a release pull request are approved here.',
    'Review the changes, approve the run on GitHub and run the command again:',
    ...urls
  ].join('\n')
}

function waitingState(check?: CheckRun): string {
  return check
    ? `CI required is ${check.status}: ${check.url}`
    : 'no CI required check that counts for the ruleset yet'
}

export async function inspectCi(step: CiStep): Promise<void> {
  const { log } = step.session.environment
  const decision = await readCi({
    ...step,
    approvedRuns: new Set(),
    reportedChecks: new Set()
  })
  switch (decision.kind) {
    case 'passed': {
      log(`CI required passed: ${decision.check.url}`)
      return
    }
    case 'failed': {
      throw new Error(failedMessage(decision.check))
    }
    case 'held': {
      throw new Error(heldMessage(decision.runs))
    }
    case 'approve': {
      for (const run of decision.runs) {
        log(`Dry run: would approve the held CI run ${run.url}`)
      }
      log('Dry run: would then wait for CI required.')
      return
    }
    case 'pending': {
      log(`Dry run: ${waitingState(decision.check)}. The merge would wait.`)
      return
    }
    case 'missing': {
      log(`Dry run: ${waitingState()}. The merge would wait.`)
    }
  }
}

export async function waitForCi(step: CiStep): Promise<void> {
  const { session, head } = step
  const { log } = session.environment
  const { checkTimeout } = session.timing
  const approvedRuns = new Set<number>()
  const reportedChecks = new Set<number>()
  let lastState = ''

  async function follow(decision: CheckDecision): Promise<void> {
    if (decision.kind === 'passed') return
    switch (decision.kind) {
      case 'failed': {
        throw new Error(failedMessage(decision.check))
      }
      case 'held': {
        throw new Error(heldMessage(decision.runs))
      }
      case 'approve': {
        for (const run of decision.runs) {
          await session.github.approveRun(run.id)
          approvedRuns.add(run.id)
          log(`Approved the held CI run ${run.url}`)
        }
        return
      }
      case 'pending':
      case 'missing': {
        const state = waitingState(
          decision.kind === 'pending' ? decision.check : undefined
        )
        if (state !== lastState) log(`  ${state}`)
        lastState = state
      }
    }
  }

  log(`Waiting for CI required on ${shortSha(head)}.`)
  const check = await waitFor({
    session,
    timeout: checkTimeout,
    describeTimeout: () =>
      `CI required did not pass on ${shortSha(head)} within ${describeDuration(checkTimeout)} (${lastState}).`,
    attempt: async () => {
      const decision = await readCi({ ...step, approvedRuns, reportedChecks })
      await follow(decision)
      return decision.kind === 'passed' ? decision.check : undefined
    }
  })
  log(`CI required passed: ${check.url}`)
}
