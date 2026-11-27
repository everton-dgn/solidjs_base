import assert from 'node:assert/strict'

import { scenarioJobs } from './classify.ts'

type Job = {
  name: string
  conclusion: string | null
}
export function releaseExpected(): Record<string, string[]> {
  return { verify: ['Verify'], scenario: scenarioJobs }
}
export function verify({
  expected,
  needs,
  jobs
}: {
  expected: Record<string, string[]>
  needs: Record<string, { result: string }>
  jobs: Job[]
}): void {
  assert.ok(Object.keys(expected).length)
  assert.deepEqual(
    Object.keys(expected).toSorted(),
    Object.keys(needs).toSorted()
  )
  for (const [key, names] of Object.entries(expected)) {
    assert.equal(
      needs[key]?.result,
      names.length > 0 ? 'success' : 'skipped',
      key
    )
    for (const name of names) {
      assert.deepEqual(
        jobs.filter(job => job.name === name).map(job => job.conclusion),
        ['success'],
        name
      )
    }
  }
}
