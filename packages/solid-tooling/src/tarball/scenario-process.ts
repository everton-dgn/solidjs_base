/* oxlint-disable node/no-sync -- Process identity is checked before terminating owned process groups. */
import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { env, kill, stdout } from 'node:process'

import { seoEnvironment } from './seo-scenarios.ts'

const ROOT = path.resolve(import.meta.dirname, '../../../..')
const VP = path.join(ROOT, 'node_modules/.bin/vp')
const COMMAND_TIMEOUT = 60_000
const CHILD_ENV: NodeJS.ProcessEnv = {
  ...env,
  SCENARIO_LABEL: 'scenario-build-value',
  VITE_SCENARIO_LABEL: 'scenario-client-value'
}
delete CHILD_ENV.NODE_ENV
delete CHILD_ENV.VITE_SITE_URL

type Command = {
  cwd: string
  args: string[]
  deadline: number
  file?: string
  expectedError?: RegExp
  variables?: Record<string, string>
}
export function stopChild(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  const inspected = spawnSync(
    'ps',
    ['-p', String(child.pid), '-o', 'pid=,pgid=,command='],
    { encoding: 'utf8', timeout: 5000 }
  )
  if (inspected.status === 1 && inspected.stdout.trim() === '') return
  assert.equal(inspected.status, 0, inspected.stderr)
  const identity = inspected.stdout.trim().split(/\s+/u)
  assert.equal(Number(identity[0]), child.pid)
  assert.equal(Number(identity[1]), child.pid)
  stdout.write(`Stopping owned process: ${inspected.stdout.trim()}\n`)
  kill(-child.pid, 'SIGKILL')
}

export async function run({
  cwd,
  args,
  deadline,
  file: executable,
  expectedError,
  variables
}: Command): Promise<string> {
  let file = executable ?? path.join(cwd, 'node_modules/.bin/vp')
  if (!executable && args[0] === 'install') file = 'bun'
  if (!executable && args[0] === 'pm') file = VP
  const started = performance.now()
  assert.ok(Date.now() < deadline, 'Scenario execution deadline exceeded')
  const child = spawn(file, args, {
    cwd,
    env: { ...CHILD_ENV, ...seoEnvironment(cwd), ...variables },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    output += chunk
  })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    output += chunk
  })
  const timer = setTimeout(
    () => {
      stopChild(child)
    },
    Math.min(COMMAND_TIMEOUT, deadline - Date.now())
  )
  try {
    const result: unknown[] = await once(child, 'close')
    const [code] = result
    stdout.write(
      `${args.join(' ')}: ${Math.round(performance.now() - started)} ms\n`
    )
    if (expectedError) {
      assert.equal(result[1], null, 'Expected a diagnostic exit, not a signal')
      assert.notEqual(code, 0, 'The negative probe must fail')
      assert.match(output, expectedError)
      stdout.write(`Expected failure: ${output.match(expectedError)?.[0]}\n`)
    } else {
      assert.equal(code, 0, `${args.join(' ')}\n${output}`)
    }
    return output
  } finally {
    clearTimeout(timer)
  }
}

export function childEnvironment(): NodeJS.ProcessEnv {
  return CHILD_ENV
}
