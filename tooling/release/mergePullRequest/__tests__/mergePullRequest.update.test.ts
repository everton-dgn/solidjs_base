import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mergePullRequest } from '../index.ts'
import {
  BAD_GATEWAY,
  BASE_SHA,
  checkRun,
  createHarness,
  endpoints,
  type FakeFile,
  failedCommand,
  featureGitHub,
  HEAD,
  HELD_RUN,
  MERGE_BASE_SHA,
  OTHER_SHA,
  releaseGitHub,
  UPDATED_HEAD,
  workflowRun,
  writes
} from './fixtures.ts'

describe('mergePullRequest branch update', () => {
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
    const { request, calls, lines } = createHarness({ github })

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
    assert.ok(
      lines.includes(
        'f0e1d2c is the merge of main at b0b1b2b into a1b2c3d, with the files of both sides. A second run takes it with --sha.'
      )
    )
    const treeReads = endpoints(calls).filter(line =>
      line.startsWith('gh api git/trees/')
    )
    assert.deepEqual(
      treeReads.toSorted(),
      [MERGE_BASE_SHA, HEAD, BASE_SHA, UPDATED_HEAD]
        .map(sha => `gh api git/trees/${sha}?recursive=1`)
        .toSorted()
    )
  })

  it('stops when the head after the update is not the merge of the base into the reviewed head', async () => {
    const unexpectedParents = [[OTHER_SHA], [HEAD, OTHER_SHA], [BASE_SHA, HEAD]]
    for (const parents of unexpectedParents) {
      const github = releaseGitHub()
      github.behindBy = 1
      github.parents = { [UPDATED_HEAD]: parents }
      github.checkRuns = { [UPDATED_HEAD]: [[]] }
      github.workflowRuns = {
        [UPDATED_HEAD]: [[workflowRun({ ...HELD_RUN, headSha: UPDATED_HEAD })]]
      }
      const { request, calls } = createHarness({ github })

      await assert.rejects(mergePullRequest(request), (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(
          error.message,
          new RegExp(
            `could not confirm what the new head ${UPDATED_HEAD} of #42 holds:\\n  Its parents are .+, not ${HEAD} and main at ${BASE_SHA}\\.`,
            'u'
          )
        )
        assert.ok(
          error.message.endsWith(
            `vp run release:merge 42 --sha ${UPDATED_HEAD}`
          )
        )
        return true
      })
      assert.deepEqual(
        writes(calls).map(call => call.args[1]),
        ['repos/{owner}/{repo}/pulls/42/update-branch']
      )
    }
  })

  it('stops when GitHub refuses the update of the branch, without another write', async () => {
    const github = featureGitHub()
    github.behindBy = 1
    github.failures = {
      'update-branch': [
        failedCommand(
          'gh: expected_head_sha does not match the head of the pull request (HTTP 422)'
        )
      ]
    }
    const { request, calls } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /Could not update the branch of #7: .+\(HTTP 422\)/u
    )
    assert.deepEqual(
      writes(calls).map(call => call.args[1]),
      ['repos/{owner}/{repo}/pulls/7/update-branch']
    )
  })

  it('prints the new head and reads its parents again after a read that failed for a reason that passes', async () => {
    const github = featureGitHub()
    github.behindBy = 1
    github.checkRuns = { [UPDATED_HEAD]: [[checkRun({})]] }
    github.workflowRuns = {
      [UPDATED_HEAD]: [[workflowRun({ headSha: UPDATED_HEAD })]]
    }
    github.failures = { [`commits/${UPDATED_HEAD}`]: [BAD_GATEWAY] }
    const { request, calls, lines } = createHarness({ github })

    await mergePullRequest(request)

    const printed = lines.indexOf(
      `New head: ${UPDATED_HEAD}. Checking it before anything is approved or merged.`
    )
    const readAgain = lines.indexOf(
      `  Could not read the commit ${UPDATED_HEAD}: gh: Bad Gateway (HTTP 502) Reading again.`
    )
    assert.ok(printed !== -1 && printed < readAgain)
    assert.ok(writes(calls).at(-1)?.args.includes(`sha=${UPDATED_HEAD}`))
  })

  it('stops with the new head and the command to merge it when its parents cannot be read', async () => {
    const github = featureGitHub()
    github.behindBy = 1
    github.failures = {
      [`commits/${UPDATED_HEAD}`]: Array.from(
        { length: 200 },
        () => BAD_GATEWAY
      )
    }
    const { request, calls } = createHarness({ github })

    await assert.rejects(mergePullRequest(request), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(
        error.message,
        /Could not read the commit .+ \(HTTP 502\) Stopped reading again after 2 minute\(s\)\./u
      )
      assert.ok(
        error.message.endsWith(`vp run release:merge 7 --sha ${UPDATED_HEAD}`)
      )
      return true
    })
    assert.deepEqual(
      writes(calls).map(call => call.args[1]),
      ['repos/{owner}/{repo}/pulls/7/update-branch']
    )
  })

  it('stops when the head does not change after the update', async () => {
    const github = featureGitHub()
    github.behindBy = 1
    github.updatedHead = HEAD
    const { request, calls } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      /The head of #7 did not change within 1 minute\(s\) after the update\./u
    )
    assert.equal(writes(calls).length, 1)
  })
})

describe('mergePullRequest files of the updated head', () => {
  it('stops, without approving or merging, on a commit with the parents of the update and other files', async () => {
    const changes: Record<string, FakeFile>[] = [
      { 'src/extra.ts': { mode: '100644', sha: 'extra-1' } },
      { 'src/rule.ts': { mode: '100644', sha: 'rule-9' } },
      { 'src/rule.ts': { mode: '100755', sha: 'rule-2' } }
    ]
    for (const change of changes) {
      const github = releaseGitHub()
      github.behindBy = 1
      const updated = github.trees[UPDATED_HEAD]
      assert.ok(updated)
      Object.assign(updated.files, change)
      github.checkRuns = { [UPDATED_HEAD]: [[]] }
      github.workflowRuns = {
        [UPDATED_HEAD]: [[workflowRun({ ...HELD_RUN, headSha: UPDATED_HEAD })]]
      }
      const { request, calls } = createHarness({ github })

      await assert.rejects(mergePullRequest(request), (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.ok(
          error.message.includes(
            `  Files that differ from the merge of main at b0b1b2b into a1b2c3d: ${Object.keys(change).join(', ')}.`
          )
        )
        assert.ok(
          error.message.endsWith(
            `vp run release:merge 42 --sha ${UPDATED_HEAD}`
          )
        )
        return true
      })
      assert.deepEqual(
        writes(calls).map(call => call.args[1]),
        ['repos/{owner}/{repo}/pulls/42/update-branch']
      )
    }
  })

  it('stops on a file that one side removed and the new head keeps', async () => {
    for (const path of ['docs/old.md', 'docs/guide.md']) {
      const github = featureGitHub()
      github.behindBy = 1
      const updated = github.trees[UPDATED_HEAD]
      assert.ok(updated)
      updated.files[path] = { mode: '100644', sha: 'kept-1' }
      const { request, calls } = createHarness({ github })

      await assert.rejects(
        mergePullRequest(request),
        new RegExp(
          `Files that differ from the merge of main at b0b1b2b into a1b2c3d: ${path.replace('.', String.raw`\.`)}\\.`,
          'u'
        )
      )
      assert.equal(writes(calls).length, 1)
    }
  })

  it('stops with the command to merge the new head when both sides changed a file', async () => {
    const github = featureGitHub()
    github.behindBy = 1
    const base = github.trees[BASE_SHA]
    const updated = github.trees[UPDATED_HEAD]
    assert.ok(base && updated)
    base.files['src/rule.ts'] = { mode: '100644', sha: 'rule-3' }
    updated.files['src/rule.ts'] = { mode: '100644', sha: 'rule-4' }
    const { request, calls } = createHarness({ github })

    await assert.rejects(mergePullRequest(request), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(
        error.message,
        [
          `The command could not confirm what the new head ${UPDATED_HEAD} of #7 holds:`,
          '  Files that main and the branch both changed, which the command cannot check: src/rule.ts.',
          'Nothing was approved or merged. Review the new head and merge it with:',
          `  vp run release:merge 7 --sha ${UPDATED_HEAD}`
        ].join('\n')
      )
      return true
    })
    assert.equal(writes(calls).length, 1)
  })

  it('stops when GitHub truncates the file list of a commit', async () => {
    const github = featureGitHub()
    github.behindBy = 1
    const base = github.trees[BASE_SHA]
    assert.ok(base)
    base.truncated = true
    const { request, calls } = createHarness({ github })

    await assert.rejects(
      mergePullRequest(request),
      new RegExp(
        `GitHub truncated the file list of ${BASE_SHA}, so the files cannot be compared\\.`,
        'u'
      )
    )
    assert.equal(writes(calls).length, 1)
  })
})
