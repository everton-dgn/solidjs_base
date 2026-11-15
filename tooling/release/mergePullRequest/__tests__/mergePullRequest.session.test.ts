import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createSession } from '../session.ts'
import {
  createHarness,
  endpoints,
  featureGitHub,
  HEAD,
  UPDATED_HEAD
} from './fixtures.ts'

const HELD_RUN_ID = 501

describe('mergePullRequest session', () => {
  it('refuses every write of a dry run before it reaches gh and lets the reads through', async () => {
    const { request, calls } = createHarness({ github: featureGitHub() })
    const { github } = createSession({ ...request, isDryRun: true })

    await assert.rejects(
      github.updateBranch({ number: 7, head: HEAD }),
      /The dry run refused to run "gh api repos\/\{owner\}\/\{repo\}\/pulls\/7\/update-branch/u
    )
    await assert.rejects(github.approveRun(HELD_RUN_ID), /The dry run refused/u)
    await assert.rejects(
      github.merge({ number: 7, sha: HEAD, title: 'Merge pull request #7' }),
      /The dry run refused/u
    )
    assert.equal(calls.length, 0)

    await github.readParents(UPDATED_HEAD)
    assert.deepEqual(endpoints(calls), [`gh api commits/${UPDATED_HEAD}`])
  })

  it('sends the writes of a real run', async () => {
    const { request, calls } = createHarness({ github: featureGitHub() })
    const { github } = createSession({ ...request, isDryRun: false })

    await github.approveRun(HELD_RUN_ID)

    assert.deepEqual(endpoints(calls), [
      `gh api actions/runs/${HELD_RUN_ID}/approve`
    ])
  })
})
