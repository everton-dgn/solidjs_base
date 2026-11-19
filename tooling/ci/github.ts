import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

import { parseJson, readFields } from '../release/mergePullRequest/json.ts'

const run = promisify(execFile)
const MAX_RESPONSE_BYTES = 33_554_432
export function environment(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing ${key}`)
  return value
}
export async function api({
  route,
  shouldPaginate = false
}: {
  route: string
  shouldPaginate?: boolean
}): Promise<unknown> {
  const args = ['api', `repos/${environment('GITHUB_REPOSITORY')}/${route}`]
  if (shouldPaginate) args.push('--paginate', '--slurp')
  const { stdout } = await run('gh', args, { maxBuffer: MAX_RESPONSE_BYTES })
  return parseJson({ text: stdout, label: route })
}
export async function resource(
  route: string
): Promise<ReturnType<typeof readFields>> {
  return readFields({ value: await api({ route }), label: route })
}
export function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError('Expected a GitHub array')
  return value
}
