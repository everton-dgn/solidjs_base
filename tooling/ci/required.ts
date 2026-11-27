import assert from 'node:assert/strict'

import { parseJson, readFields } from '../release/mergePullRequest/json.ts'
import { api, environment, list } from './github.ts'
import { releaseExpected, verify } from './results.ts'

function entries(value: unknown): [string, unknown][] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected a job map')
  }
  return Object.entries(value)
}
function input(key: string): unknown {
  return parseJson({ text: environment(key), label: key })
}
if (import.meta.main) {
  const pages = list(
    await api({
      route: `actions/runs/${environment('GITHUB_RUN_ID')}/attempts/${environment('GITHUB_RUN_ATTEMPT')}/jobs?per_page=100`,
      shouldPaginate: true
    })
  )
  const jobs = pages.flatMap(value =>
    readFields({ value, label: 'attempt' })
      .list('jobs')
      .map(job => ({
        name: job.string('name'),
        conclusion: job.optionalString('conclusion') ?? null
      }))
  )
  const needs = Object.fromEntries(
    entries(input('NEEDS')).map(([key, value]) => [
      key,
      { result: readFields({ value, label: key }).string('result') }
    ])
  )
  const isRelease = environment('GITHUB_WORKFLOW') === 'Release'
  const expected = isRelease
    ? releaseExpected()
    : Object.fromEntries(
        entries(input('EXPECTED')).map(([key, value]) => [
          key,
          list(value).map(name => {
            if (typeof name !== 'string') {
              throw new TypeError('Expected a job name')
            }
            return name
          })
        ])
      )
  if (isRelease) {
    assert.equal(needs['release-please']?.result, 'success')
    delete needs['release-please']
  }
  verify({ expected, needs, jobs })
}
