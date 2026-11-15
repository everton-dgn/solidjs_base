import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  decideCheck,
  isBranchUpdate,
  isReadCommand,
  isReleasePullRequest,
  mergeCommitTitle,
  RELEASE_WORKFLOW,
  refusePullRequest,
  releasedVersions
} from '../decisions.ts'
import type { CheckRun, Command, PullRequest, WorkflowRun } from '../types.ts'

const HEAD = 'a1b2c3d'

const PULL_REQUEST: PullRequest = {
  number: 42,
  title: 'chore: release main',
  state: 'OPEN',
  isDraft: false,
  headSha: HEAD,
  headBranch: 'release-please--branches--main',
  headOwner: 'everton-dgn',
  baseBranch: 'main',
  isCrossRepository: false,
  mergeStateStatus: 'CLEAN',
  url: 'https://github.com/everton-dgn/solidjs_base/pull/42'
}

function check(fields: Partial<CheckRun>): CheckRun {
  return {
    id: 1,
    status: 'completed',
    conclusion: 'success',
    suiteId: 10,
    url: 'https://example.test/check',
    ...fields
  }
}

function run(fields: Partial<WorkflowRun>): WorkflowRun {
  return {
    id: 100,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    headSha: HEAD,
    suiteId: 10,
    url: 'https://example.test/run',
    ...fields
  }
}

const NOTHING_APPROVED: ReadonlySet<number> = new Set()

function gh(...args: string[]): Command {
  return { file: 'gh', args }
}

describe('mergePullRequest decisions', () => {
  it('counts success, neutral and skipped as a passed check', () => {
    for (const conclusion of ['success', 'neutral', 'skipped']) {
      const decision = decideCheck({
        head: HEAD,
        checkRuns: [check({ conclusion })],
        workflowRuns: [run({})],
        approvedRuns: NOTHING_APPROVED,
        canApprove: true
      })
      assert.equal(decision.kind, 'passed')
    }
  })

  it('reads the latest counted check', () => {
    const decision = decideCheck({
      head: HEAD,
      checkRuns: [
        check({ id: 2, conclusion: 'failure' }),
        check({ id: 3, status: 'in_progress', conclusion: undefined })
      ],
      workflowRuns: [run({})],
      approvedRuns: NOTHING_APPROVED,
      canApprove: true
    })
    assert.equal(decision.kind, 'pending')
  })

  it('ignores a check of a workflow_dispatch run', () => {
    const decision = decideCheck({
      head: HEAD,
      checkRuns: [check({ suiteId: 20 })],
      workflowRuns: [run({ event: 'workflow_dispatch', suiteId: 20 })],
      approvedRuns: NOTHING_APPROVED,
      canApprove: true
    })
    assert.deepEqual(decision, { kind: 'missing' })
  })

  it('approves only a held CI run of the same head that was not approved yet', () => {
    const held = run({ id: 1, conclusion: 'action_required' })
    const approved = run({ id: 4, conclusion: 'action_required' })
    const decision = decideCheck({
      head: HEAD,
      checkRuns: [],
      workflowRuns: [
        held,
        run({ id: 2, conclusion: 'action_required', headSha: 'other' }),
        run({ id: 3, conclusion: 'action_required', path: RELEASE_WORKFLOW }),
        approved
      ],
      approvedRuns: new Set([approved.id]),
      canApprove: true
    })
    assert.deepEqual(decision, { kind: 'approve', runs: [held] })
  })

  it('finds a held run by its conclusion or by its status', () => {
    for (const held of [
      run({ status: 'completed', conclusion: 'action_required' }),
      run({ status: 'action_required', conclusion: undefined })
    ]) {
      const decision = decideCheck({
        head: HEAD,
        checkRuns: [],
        workflowRuns: [held],
        approvedRuns: NOTHING_APPROVED,
        canApprove: true
      })
      assert.deepEqual(decision, { kind: 'approve', runs: [held] })
    }
  })

  it('keeps a held run of a pull request that cannot be approved here', () => {
    const decision = decideCheck({
      head: HEAD,
      checkRuns: [],
      workflowRuns: [run({ conclusion: 'action_required' })],
      approvedRuns: NOTHING_APPROVED,
      canApprove: false
    })
    assert.equal(decision.kind, 'held')
  })

  it('takes a release pull request only from a branch of this repository', () => {
    assert.equal(isReleasePullRequest(PULL_REQUEST), true)
    assert.equal(
      isReleasePullRequest({ ...PULL_REQUEST, isCrossRepository: true }),
      false
    )
    assert.equal(
      isReleasePullRequest({ ...PULL_REQUEST, headBranch: 'feat/thing' }),
      false
    )
  })

  it('refuses a merged, closed, draft or conflicting pull request', () => {
    assert.match(
      refusePullRequest({ ...PULL_REQUEST, state: 'MERGED' }) ?? '',
      /is merged/u
    )
    assert.match(
      refusePullRequest({ ...PULL_REQUEST, mergeStateStatus: 'DIRTY' }) ?? '',
      /has conflicts with main/u
    )
    assert.equal(refusePullRequest(PULL_REQUEST), undefined)
  })

  it('takes as a branch update only the merge of the base into the old head', () => {
    const update = { head: 'head', base: 'base' }
    assert.equal(isBranchUpdate({ ...update, parents: ['head', 'base'] }), true)
    for (const parents of [
      ['base', 'head'],
      ['head'],
      ['head', 'other'],
      ['head', 'base', 'other'],
      []
    ]) {
      assert.equal(isBranchUpdate({ ...update, parents }), false)
    }
  })

  it('lets the dry run read and refuses what writes', () => {
    const reads = [
      gh('pr', 'view', '42', '--json', 'number'),
      gh('api', 'repos/{owner}/{repo}/compare/main...a1b2c3d', '--jq', '.'),
      gh('api', 'repos/{owner}/{repo}/commits/a1b2c3d', '-X', 'GET'),
      gh('api', 'graphql', '-F', 'number=42', '-f', 'query=query($n: Int!) {}'),
      { file: 'npm', args: ['view', '@evertondgn/solid-tooling@0.7.0'] }
    ] satisfies Command[]
    const writes = [
      gh('api', 'repos/{owner}/{repo}/pulls/42/merge', '-X', 'PUT'),
      gh('api', 'repos/{owner}/{repo}/actions/runs/1/approve', '-f', 'a=b'),
      gh('api', 'repos/{owner}/{repo}/issues/42/labels', '--input', 'x.json'),
      gh('api', 'graphql', '-f', 'query=mutation { closePullRequest }'),
      gh('pr', 'merge', '42'),
      { file: 'npm', args: ['publish'] }
    ] satisfies Command[]
    for (const command of reads) assert.equal(isReadCommand(command), true)
    for (const command of writes) assert.equal(isReadCommand(command), false)
  })

  it('writes the classic merge commit title', () => {
    assert.equal(
      mergeCommitTitle(PULL_REQUEST),
      'Merge pull request #42 from everton-dgn/release-please--branches--main'
    )
  })

  it('releases only the packages whose version changed', () => {
    assert.deepEqual(
      releasedVersions({
        current: { 'packages/a': '0.7.0', 'packages/b': '0.6.0' },
        previous: { 'packages/a': '0.6.0', 'packages/b': '0.6.0' }
      }),
      [{ path: 'packages/a', version: '0.7.0' }]
    )
  })
})
