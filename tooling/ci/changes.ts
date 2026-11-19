import { appendFile, readFile } from 'node:fs/promises'

import { parseJson, readFields } from '../release/mergePullRequest/json.ts'
import { classify, PR_LIMIT, type ChangedFile } from './classify.ts'
import { api, environment, list, resource } from './github.ts'

function fields(value: unknown) {
  return readFields({ value, label: 'GitHub response' })
}
function changedFile(file: ReturnType<typeof fields>): ChangedFile {
  return {
    filename: file.string('filename'),
    status: file.string('status'),
    previous_filename: file.optionalString('previous_filename')
  }
}
async function isCheckedMerge(sha: string): Promise<boolean> {
  const commit = await resource(`commits/${sha}`)
  const [base, head, ...others] = commit.list('parents')
  if (!base || !head || others.length > 0) return false
  const headSha = head.string('sha')
  const comparison = await resource(
    `compare/${base.string('sha')}...${headSha}`
  )
  if (comparison.number('behind_by') !== 0) return false
  const parent = await resource(`commits/${headSha}`)
  if (
    parent.fields('commit').fields('tree').string('sha') !==
    commit.fields('commit').fields('tree').string('sha')
  ) {
    return false
  }
  const checks = await resource(
    `commits/${headSha}/check-runs?check_name=CI%20required`
  )
  return checks
    .list('check_runs')
    .some(run => run.optionalString('conclusion') === 'success')
}
if (import.meta.main) {
  const event = environment('GITHUB_EVENT_NAME')
  const eventText = await readFile(environment('GITHUB_EVENT_PATH'), 'utf8')
  const payload = fields(
    parseJson({
      text: eventText,
      label: 'event'
    })
  )
  const pr = payload.optionalFields('pull_request')
  const branch = pr?.optionalFields('head')?.optionalString('ref') ?? ''
  const isForced = event === 'push' && payload.boolean('forced')
  let count =
    event === 'pull_request'
      ? (pr?.optionalNumber('changed_files') ?? PR_LIMIT)
      : 0
  let files: ChangedFile[] = []
  let isChecked = false
  if (pr && !branch.startsWith('release-please--') && count < PR_LIMIT) {
    const route = `pulls/${pr.number('number')}`
    files = list(
      await api({ route: `${route}/files?per_page=100`, shouldPaginate: true })
    ).flatMap(page => list(page).map(file => changedFile(fields(file))))
    const current = await resource(route)
    if (
      files.length !== count ||
      ['base', 'head'].some(
        side =>
          current.fields(side).string('sha') !== pr.fields(side).string('sha')
      )
    ) {
      count = PR_LIMIT
    }
  } else if (event === 'push' && !isForced) {
    const after = payload.string('after')
    isChecked = await isCheckedMerge(after)
    if (!isChecked) {
      const comparison = await resource(
        `compare/${payload.string('before')}...${after}`
      )
      files = comparison.list('files').map(file => changedFile(file))
    }
  }
  const result = classify({ event, files, branch, isForced, isChecked, count })
  await appendFile(
    environment('GITHUB_OUTPUT'),
    Object.entries(result)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}\n`)
      .join('')
  )
}
