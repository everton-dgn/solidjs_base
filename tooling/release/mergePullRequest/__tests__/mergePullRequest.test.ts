import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { RELEASE_WORKFLOW } from '../decisions.ts'
import { mergePullRequest } from '../index.ts'
import {
  checkRun,
  createHarness,
  endpoints,
  failedCommand,
  featureGitHub,
  HEAD,
  jsonResult,
  MERGE_SHA,
  OTHER_SHA,
  PROVENANCE,
  releaseGitHub,
  UPDATED_HEAD,
  workflowRun,
  writes
} from './fixtures.ts'

const HELD_RUN = workflowRun({
  id: 501,
  status: 'action_required',
  conclusion: 'action_required',
  suiteId: 9001
})

describe('mergePullRequest refusals', () => {
  it('refuses a closed pull request before any other read', async () => {
    const github = featureGitHub()
    github.pullRequest.state = 'CLOSED'
    const { request, calls } = createHarness({ github })

    await assert.rejects(mergePullRequest(request), /#7 is closed/u)
    assert.deepEqual(endpoints(calls), ['gh pr view'])
  })

  it('refuses a draft', async () => {
    const github = featureGitHub()
    github.pullRequest.isDraft = true
    const { request, calls } = createHarness({ github })

    await assert.rejects(mergePullRequest(request), /#7 is a draft/u)
    assert.deepEqual(endpoints(calls), ['gh pr view'])
  })

  it('lists the unresolved conversations of every page and stops', async () => {
    const github = featureGitHub()
    github.threadPages = [
      [
        {
          isResolved: true,
          path: 'docs/a.md',
          line: 1,
          originalLine: 1,
          author: 'octocat'
        },
        {
          isResolved: false,
          path: 'src/rule.ts',
          line: 12,
          originalLine: 10,
          author: 'coderabbitai'
        }
      ],
      [
        {
          isResolved: false,
          path: 'src/old.ts',
          line: null,
          originalLine: 8,
          author: null
        }
      ]
    ]
    const { request, calls } = createHarness({ github })

    await assert.rejects(mergePullRequest(request), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /2 unresolved review conversation/u)
      assert.match(error.message, /src\/rule\.ts:12 by coderabbitai/u)
      assert.match(error.message, /src\/old\.ts:8 by a deleted user/u)
      assert.doesNotMatch(error.message, /docs\/a\.md/u)
      return true
    })
    assert.deepEqual(writes(calls), [])
  })
})

describe('mergePullRequest CI and branch', () => {
  it('merges main into a branch that is behind and merges the new head', async () => {
    const github = featureGitHub()
    github.behindBy = 2
    github.checkRuns = {
      [UPDATED_HEAD]: [
        [checkRun({ status: 'in_progress', conclusion: null })],
        [checkRun({})]
      ]
    }
    github.workflowRuns = {
      [UPDATED_HEAD]: [[workflowRun({ headSha: UPDATED_HEAD })]]
    }
    const { request, calls } = createHarness({ github })

    await mergePullRequest(request)

    const [update, merge] = writes(calls)
    assert.deepEqual(update?.args, [
      'api',
      'repos/{owner}/{repo}/pulls/7/update-branch',
      '-X',
      'PUT',
      '-f',
      `expected_head_sha=${HEAD}`
    ])
    assert.ok(merge?.args.includes(`sha=${UPDATED_HEAD}`))
    assert.ok(
      calls.every(call => !call.args[1]?.includes(`commits/${HEAD}/check-runs`))
    )
  })

  it('approves only the held CI run of the head of a release pull request', async () => {
    const github = releaseGitHub()
    github.checkRuns = {
      [HEAD]: [
        [checkRun({ id: 90, suiteId: 8000 })],
        [checkRun({ id: 90, suiteId: 8000 })],
        [checkRun({ id: 90, suiteId: 8000 }), checkRun({ id: 91 })]
      ]
    }
    const dispatchRun = workflowRun({
      id: 400,
      event: 'workflow_dispatch',
      suiteId: 8000
    })
    const otherHead = workflowRun({
      ...HELD_RUN,
      id: 502,
      headSha: OTHER_SHA,
      suiteId: 9002
    })
    const heldRelease = workflowRun({
      ...HELD_RUN,
      id: 503,
      path: RELEASE_WORKFLOW,
      suiteId: 9003
    })
    github.workflowRuns = {
      ...github.workflowRuns,
      [HEAD]: [
        [dispatchRun, HELD_RUN, otherHead, heldRelease],
        [dispatchRun, HELD_RUN, otherHead, heldRelease],
        [dispatchRun, workflowRun({ id: 501 }), otherHead, heldRelease]
      ]
    }
    const { request, calls, lines } = createHarness({ github })

    await mergePullRequest(request)

    const approvals = writes(calls).filter(call =>
      call.args[1]?.endsWith('/approve')
    )
    assert.deepEqual(
      approvals.map(call => call.args[1]),
      ['repos/{owner}/{repo}/actions/runs/501/approve']
    )
    assert.ok(
      lines.some(line =>
        line.startsWith('Ignoring CI required from a workflow_dispatch run')
      )
    )
    assert.ok(
      calls.every(
        call =>
          call.args[0] !== 'workflow' &&
          !call.args.join(' ').includes('dispatches')
      )
    )
  })

  it('refuses a held CI run of a pull request that is not a release', async () => {
    const github = featureGitHub()
    github.checkRuns = { [HEAD]: [[]] }
    github.workflowRuns = { [HEAD]: [[HELD_RUN]] }
    const { request, calls } = createHarness({ github })

    await assert.rejects(mergePullRequest(request), /waits for approval/u)
    assert.deepEqual(writes(calls), [])
  })

  it('does not approve the run of a fork that uses the release branch prefix', async () => {
    const github = releaseGitHub()
    github.pullRequest.isCrossRepository = true
    github.checkRuns = { [HEAD]: [[]] }
    github.workflowRuns = { [HEAD]: [[HELD_RUN]] }
    const { request, calls } = createHarness({ github })

    await assert.rejects(mergePullRequest(request), /waits for approval/u)
    assert.deepEqual(writes(calls), [])
  })

  it('fails with the link of a failed CI required check', async () => {
    const github = featureGitHub()
    github.checkRuns = { [HEAD]: [[checkRun({ conclusion: 'failure' })]] }
    const { request, calls } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /CI required ended as failure: https:\/\/github\.com\/.+\/job\/100/u
    )
    assert.deepEqual(writes(calls), [])
  })

  it('fails when CI required does not appear in time', async () => {
    const github = featureGitHub()
    github.checkRuns = { [HEAD]: [[]] }
    github.workflowRuns = { [HEAD]: [[]] }
    const { request, calls } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /CI required did not pass on a1b2c3d within 1 minute/u
    )
    assert.deepEqual(writes(calls), [])
  })
})

describe('mergePullRequest merge and publication', () => {
  it('reports the merge that GitHub refused', async () => {
    const refusals = [
      failedCommand(
        'gh: Required status check "CI required" is expected. (HTTP 405)'
      ),
      jsonResult({ merged: false, message: 'Head branch was modified' })
    ]
    for (const refusal of refusals) {
      const github = featureGitHub()
      github.mergeResult = refusal
      const { request } = createHarness({ github })

      await assert.rejects(
        mergePullRequest(request),
        /GitHub refused the merge of #7: (?:gh: Required status check|Head branch was modified)/u
      )
    }
  })

  it('merges a pull request that is not a release without a publication step', async () => {
    const github = featureGitHub()
    const { request, calls, lines } = createHarness({ github })

    await mergePullRequest(request)

    assert.deepEqual(
      writes(calls).map(call => call.args),
      [
        [
          'api',
          'repos/{owner}/{repo}/pulls/7/merge',
          '-X',
          'PUT',
          '-f',
          'merge_method=merge',
          '-f',
          `sha=${HEAD}`,
          '-f',
          'commit_title=Merge pull request #7 from everton-dgn/feat/a-rule',
          '-f',
          'commit_message='
        ]
      ]
    )
    assert.ok(calls.every(call => call.file === 'gh'))
    const commandLines = calls.map(call => call.args.join(' '))
    assert.ok(commandLines.every(line => !line.includes(MERGE_SHA)))
    assert.ok(
      lines.includes(
        'Not a release pull request: there is no publication to check.'
      )
    )
  })

  it('waits for the Release workflow and checks each released version on npm', async () => {
    const github = releaseGitHub()
    const { request, calls, lines } = createHarness({ github })

    await mergePullRequest(request)

    assert.ok(lines.includes('  Publish packages/solid-tooling: success'))
    assert.ok(lines.includes('  Publish packages/solid-runtime: success'))
    const views = calls
      .filter(call => call.file === 'npm')
      .map(call => call.args[1])
    assert.deepEqual(views, [
      '@evertondgn/solid-tooling@0.7.0',
      '@evertondgn/solid-tooling@0.7.0',
      '@evertondgn/solid-runtime@0.7.0'
    ])
    assert.ok(
      lines.includes(
        `@evertondgn/solid-runtime@0.7.0 is on npm, with provenance ${PROVENANCE}.`
      )
    )
    assert.ok(
      calls.some(call =>
        call.args[1]?.endsWith(
          `contents/.release-please-manifest.json?ref=${MERGE_SHA}%5E1`
        )
      )
    )
  })

  it('fails when the Release workflow fails, with its link', async () => {
    const github = releaseGitHub()
    github.workflowRuns[MERGE_SHA] = [
      [
        workflowRun({
          id: 700,
          path: RELEASE_WORKFLOW,
          event: 'push',
          conclusion: 'failure',
          headSha: MERGE_SHA
        })
      ]
    ]
    const { request, calls } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /The Release workflow ended as failure: https:\/\/github\.com\/.+\/runs\/700/u
    )
    assert.ok(calls.every(call => call.file === 'gh'))
  })

  it('fails when a released version does not reach npm in time', async () => {
    const github = releaseGitHub()
    github.registry['@evertondgn/solid-tooling@0.7.0'] = [
      failedCommand('npm error code E404')
    ]
    const { request } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /@evertondgn\/solid-tooling@0\.7\.0 did not appear on npm within 10 second/u
    )
  })
})

describe('mergePullRequest dry run', () => {
  it('reads the state and writes nothing in a dry run', async () => {
    const github = releaseGitHub()
    github.checkRuns = { [HEAD]: [[]] }
    github.workflowRuns = { [HEAD]: [[HELD_RUN]] }
    const { request, calls, lines } = createHarness({ github, isDryRun: true })

    await mergePullRequest(request)

    assert.deepEqual(writes(calls), [])
    assert.ok(
      lines.some(line =>
        line.startsWith('Dry run: would approve the held CI run')
      )
    )
    assert.ok(
      lines.includes(
        'Dry run: would merge #42 at a1b2c3d with the title "Merge pull request #42 from everton-dgn/release-please--branches--main" and an empty body.'
      )
    )
    assert.ok(
      lines.includes(
        'Dry run: would wait for the Release workflow of the merge commit and check @evertondgn/solid-tooling@0.7.0, @evertondgn/solid-runtime@0.7.0 on npm.'
      )
    )
  })

  it('plans the update of a branch that is behind in a dry run', async () => {
    const github = featureGitHub()
    github.behindBy = 3
    const { request, calls, lines } = createHarness({ github, isDryRun: true })

    await mergePullRequest(request)

    assert.deepEqual(writes(calls), [])
    assert.equal(github.pullRequest.headSha, HEAD)
    assert.ok(
      lines.some(line =>
        line.startsWith('Dry run: would merge main into the branch')
      )
    )
    assert.ok(calls.every(call => !call.args[1]?.includes('check-runs')))
  })
})
