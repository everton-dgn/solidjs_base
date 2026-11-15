import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { RELEASE_WORKFLOW } from '../decisions.ts'
import { mergePullRequest } from '../index.ts'
import { TIMED_OUT_EXIT_CODE } from '../runner.ts'
import {
  BAD_GATEWAY,
  checkRun,
  createHarness,
  endpoints,
  failedCommand,
  featureGitHub,
  HEAD,
  HELD_RUN,
  jsonResult,
  MERGE_SHA,
  OTHER_SHA,
  PROVENANCE,
  releaseGitHub,
  workflowRun,
  writes
} from './fixtures.ts'

const TIMED_OUT = {
  exitCode: TIMED_OUT_EXIT_CODE,
  stdout: '',
  stderr: 'gh api did not finish within 2 minute(s) and was stopped.'
}

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

  it('refuses a head that is not the one passed with --sha, in a dry run too', async () => {
    for (const isDryRun of [false, true]) {
      const github = releaseGitHub()
      const { request, calls } = createHarness({
        github,
        isDryRun,
        expectedSha: OTHER_SHA
      })

      await assert.rejects(
        mergePullRequest(request),
        new RegExp(
          `The head of #42 is ${HEAD}, not ${OTHER_SHA} as passed with --sha`,
          'u'
        )
      )
      assert.deepEqual(endpoints(calls), ['gh pr view'])
    }
  })

  it('requires --sha to merge a release pull request', async () => {
    const github = releaseGitHub()
    const harness = createHarness({ github })
    const request = { ...harness.request, expectedSha: undefined }

    await assert.rejects(
      mergePullRequest(request),
      /#42 is a release pull request\. Pass the head you reviewed with --sha/u
    )
    assert.deepEqual(endpoints(harness.calls), ['gh pr view'])
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

describe('mergePullRequest CI', () => {
  it('never merges on a CI required check that only a workflow_dispatch run reports', async () => {
    const github = featureGitHub()
    github.checkRuns = { [HEAD]: [[checkRun({ suiteId: 8000 })]] }
    github.workflowRuns = {
      [HEAD]: [[workflowRun({ event: 'workflow_dispatch', suiteId: 8000 })]]
    }
    const { request, calls, lines } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /CI required did not pass on a1b2c3d within 1 minute/u
    )
    assert.deepEqual(writes(calls), [])
    assert.ok(
      lines.some(line =>
        line.startsWith('Ignoring CI required from a workflow_dispatch run')
      )
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

  it('reads every page of the CI required checks and of the workflow runs', async () => {
    const github = featureGitHub()
    github.pageSize = 1
    github.checkRuns = {
      [HEAD]: [[checkRun({ id: 90, suiteId: 8000 }), checkRun({ id: 100 })]]
    }
    github.workflowRuns = {
      [HEAD]: [
        [
          workflowRun({ id: 400, event: 'workflow_dispatch', suiteId: 8000 }),
          workflowRun({})
        ]
      ]
    }
    const { request, calls } = createHarness({ github })

    await mergePullRequest(request)

    assert.deepEqual(
      writes(calls).map(call => call.args[1]),
      ['repos/{owner}/{repo}/pulls/7/merge']
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

describe('mergePullRequest failed reads', () => {
  it('reads again after a read that failed for a reason that passes', async () => {
    for (const failure of [BAD_GATEWAY, TIMED_OUT]) {
      const github = featureGitHub()
      github.failures = { 'check-runs': [failure] }
      const { request, calls, lines } = createHarness({ github })

      await mergePullRequest(request)

      assert.ok(
        lines.includes(
          `  Could not list the CI required checks of ${HEAD}: ${failure.stderr} Reading again.`
        )
      )
      assert.equal(writes(calls).length, 1)
    }
  })

  it('reads again while waiting for the Release workflow after the merge', async () => {
    const github = releaseGitHub()
    github.failures = { [`actions/runs?head_sha=${MERGE_SHA}`]: [BAD_GATEWAY] }
    const { request, lines } = createHarness({ github })

    await mergePullRequest(request)

    assert.equal(lines.at(-1), 'The release is published.')
  })

  it('reads the manifest and the jobs again after the merge', async () => {
    const github = releaseGitHub()
    github.failures = {
      [`.release-please-manifest.json?ref=${MERGE_SHA}`]: [BAD_GATEWAY],
      'runs/700/jobs': [BAD_GATEWAY]
    }
    const { request, calls, lines } = createHarness({ github })

    await mergePullRequest(request)

    assert.deepEqual(
      lines.filter(line => line.endsWith('Reading again.')),
      [
        `  Could not read .release-please-manifest.json at ${MERGE_SHA}: gh: Bad Gateway (HTTP 502) Reading again.`,
        '  Could not list the jobs of the workflow run 700: gh: Bad Gateway (HTTP 502) Reading again.'
      ]
    )
    assert.equal(lines.at(-1), 'The release is published.')
    assert.equal(writes(calls).length, 1)
  })

  it('stops at once on a read that failed for another reason', async () => {
    const github = featureGitHub()
    github.failures = {
      'check-runs': [failedCommand('gh: Bad credentials (HTTP 401)')]
    }
    const { request, calls } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /Could not list the CI required checks of .+: gh: Bad credentials \(HTTP 401\)/u
    )
    assert.deepEqual(writes(calls), [])
  })

  it('never repeats a write that failed', async () => {
    const github = releaseGitHub()
    github.checkRuns = { [HEAD]: [[]] }
    github.workflowRuns = { [HEAD]: [[HELD_RUN]] }
    github.failures = { '/approve': [BAD_GATEWAY] }
    const { request, calls } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /Could not approve the workflow run 501: gh: Bad Gateway \(HTTP 502\)/u
    )
    assert.deepEqual(
      writes(calls).map(call => call.args[1]),
      ['repos/{owner}/{repo}/actions/runs/501/approve']
    )
  })
})

describe('mergePullRequest merge', () => {
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
        /GitHub did not confirm the merge of #7: (?:gh: Required status check|Head branch was modified)/u
      )
    }
  })

  it('reads the pull request after a merge that timed out or got an HTTP 502 and goes on when it is merged', async () => {
    for (const failure of [TIMED_OUT, BAD_GATEWAY]) {
      const github = releaseGitHub()
      github.mergeResult = failure
      github.pullRequestAfterMerge = { state: 'MERGED', mergeSha: MERGE_SHA }
      const { request, calls, lines } = createHarness({ github })

      await mergePullRequest(request)

      assert.ok(
        lines.includes(
          `GitHub did not confirm the merge of #42: ${failure.stderr} Reading #42 again.`
        )
      )
      assert.ok(lines.includes('Merged #42 as 0123456.'))
      assert.equal(lines.at(-1), 'The release is published.')
      assert.deepEqual(
        writes(calls).map(call => call.args[1]),
        ['repos/{owner}/{repo}/pulls/42/merge']
      )
    }
  })

  it('stops without sending the merge again when the pull request is still open after an uncertain merge', async () => {
    for (const failure of [TIMED_OUT, BAD_GATEWAY]) {
      const github = featureGitHub()
      github.mergeResult = failure
      const { request, calls } = createHarness({ github })

      await assert.rejects(mergePullRequest(request), (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(
          error.message,
          [
            `GitHub did not confirm the merge of #7: ${failure.stderr}`,
            '#7 is open.',
            'The merge was not sent again, and GitHub may still merge it. Run the command again, which reads the pull request first:',
            `  vp run release:merge 7 --sha ${HEAD}`
          ].join('\n')
        )
        return true
      })
      assert.deepEqual(
        writes(calls).map(call => call.args[1]),
        ['repos/{owner}/{repo}/pulls/7/merge']
      )
    }
  })

  it('merges a pull request that is not a release without --sha or a publication step', async () => {
    const github = featureGitHub()
    const harness = createHarness({ github })
    const { calls, lines } = harness
    const request = { ...harness.request, expectedSha: undefined }

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
})

describe('mergePullRequest publication', () => {
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

  it('checks again the publication of a merged release pull request, without --sha or a write', async () => {
    for (const isDryRun of [false, true]) {
      const github = releaseGitHub()
      github.pullRequest.state = 'MERGED'
      github.pullRequest.mergeSha = MERGE_SHA
      const harness = createHarness({ github, isDryRun })
      const { calls, lines } = harness
      const request = { ...harness.request, expectedSha: undefined }

      await mergePullRequest(request)

      assert.deepEqual(writes(calls), [])
      assert.equal(
        lines[0],
        '#42 was merged as 0123456. Checking its publication only.'
      )
      assert.equal(
        lines.at(-1),
        isDryRun
          ? 'Dry run: would wait for the Release workflow of the merge commit and check @evertondgn/solid-tooling@0.7.0, @evertondgn/solid-runtime@0.7.0 on npm.'
          : 'The release is published.'
      )
    }
  })

  it('refuses a merged pull request that is not a release', async () => {
    const github = featureGitHub()
    github.pullRequest.state = 'MERGED'
    github.pullRequest.mergeSha = MERGE_SHA
    const { request, calls } = createHarness({ github })

    await assert.rejects(mergePullRequest(request), /#7 is merged/u)
    assert.deepEqual(endpoints(calls), ['gh pr view'])
  })

  it('fails when the Release workflow fails or is cancelled, with its link', async () => {
    for (const conclusion of ['failure', 'cancelled']) {
      const github = releaseGitHub()
      github.workflowRuns[MERGE_SHA] = [
        [
          workflowRun({
            id: 700,
            path: RELEASE_WORKFLOW,
            event: 'push',
            conclusion,
            headSha: MERGE_SHA
          })
        ]
      ]
      const { request, calls } = createHarness({ github })

      await assert.rejects(
        mergePullRequest(request),
        new RegExp(
          `The Release workflow ended as ${conclusion}: https://github\\.com/.+/runs/700`,
          'u'
        )
      )
      assert.ok(calls.every(call => call.file === 'gh'))
    }
  })

  it('follows the conclusion of the whole Release run, so a failed Release pull request job stops it before npm', async () => {
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
    const releasePullRequestJob = github.jobs['700']?.find(
      job => job.name === 'Release pull request'
    )
    assert.ok(releasePullRequestJob)
    releasePullRequestJob.conclusion = 'failure'
    const { request, calls, lines } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /The Release workflow ended as failure: https:\/\/github\.com\/.+\/runs\/700/u
    )
    assert.ok(lines.includes('  Publish packages/solid-runtime: success'))
    assert.ok(
      lines.some(line =>
        line.startsWith('  Release pull request: failure https://')
      )
    )
    assert.ok(calls.every(call => call.file === 'gh'))
  })

  it('fails when the Release workflow of the merge commit does not finish in time', async () => {
    const github = releaseGitHub()
    github.workflowRuns[MERGE_SHA] = [[]]
    const { request, calls } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /The Release workflow of 0123456 did not finish within 1 minute\(s\)\./u
    )
    assert.ok(calls.every(call => call.file === 'gh'))
  })

  it('reports a released version that is on npm without provenance', async () => {
    const github = releaseGitHub()
    github.registry['@evertondgn/solid-tooling@0.7.0'] = [jsonResult(['0.7.0'])]
    const { request } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /@evertondgn\/solid-tooling@0\.7\.0 is on npm without a provenance statement\./u
    )
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
  it('reads the state, writes nothing and prints the head to pass with --sha in a dry run', async () => {
    const github = releaseGitHub()
    github.checkRuns = { [HEAD]: [[]] }
    github.workflowRuns = { [HEAD]: [[HELD_RUN]] }
    const harness = createHarness({ github, isDryRun: true })
    const { calls, lines } = harness
    const request = { ...harness.request, expectedSha: undefined }

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
    assert.equal(
      lines.at(-1),
      `To merge this head: vp run release:merge 42 --sha ${HEAD}`
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
