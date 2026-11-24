import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { it } from 'node:test'

import { psGroups, statGroups } from '../src/isTerminalOwner/index.ts'

type StatFields = { name: string; group: number; foreground: number }
function stat({ name, group, foreground }: StatFields): string {
  return `4242 (${name}) S 1 ${group} ${group} 34816 ${foreground} 4194560 1 0 0 0\n`
}

void it('reads the group and the foreground group after a command name with spaces and parentheses', () => {
  assert.deepEqual(
    statGroups(stat({ name: '(a b) c)', group: 300, foreground: 400 })),
    { group: 300, foreground: 400 }
  )
})

void it('has no answer from /proc when the process has no controlling terminal', () => {
  for (const foreground of [-1, 0]) {
    assert.equal(
      statGroups(stat({ name: 'node', group: 300, foreground })),
      undefined,
      String(foreground)
    )
  }
  assert.equal(statGroups(''), undefined)
})

void it('reads the foreground group and the group in the order ps prints them', () => {
  assert.deepEqual(psGroups({ stdout: '  400   300\n', error: undefined }), {
    group: 300,
    foreground: 400
  })
})

void it('has no answer from ps without a controlling terminal, with no output or after its timeout', () => {
  const timedOut = Object.assign(new Error('spawnSync /bin/ps ETIMEDOUT'), {
    code: 'ETIMEDOUT'
  })
  for (const answer of [
    { stdout: '    0   300\n', error: undefined },
    { stdout: '   -1   300\n', error: undefined },
    { stdout: '', error: undefined },
    { stdout: '', error: timedOut }
  ]) {
    assert.equal(psGroups(answer), undefined, JSON.stringify(answer))
  }
})

const psTimeoutMs = 250
void it('runs /bin/ps with a timeout and writes as before when it does not answer in time', () => {
  const script = `
    import childProcess from 'node:child_process'
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    const calls = []
    const read = fs.readFileSync
    fs.readFileSync = (file, ...rest) => {
      if (file === '/proc/self/stat') throw new Error('no /proc')
      return read(file, ...rest)
    }
    childProcess.spawnSync = (command, args, options) => {
      calls.push([command, options.timeout])
      return { stdout: '', error: Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }) }
    }
    syncBuiltinESMExports()
    const { isTerminalOwner } = await import('./src/isTerminalOwner/index.ts')
    process.stdout.write(JSON.stringify({ owns: isTerminalOwner(), calls }))
  `
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { encoding: 'utf8' }
  )
  assert.equal(child.status, 0, child.stderr)
  assert.deepEqual(JSON.parse(child.stdout), {
    owns: true,
    calls: [['/bin/ps', psTimeoutMs]]
  })
})

void it('owns the terminal only when the CLI leads the foreground group', () => {
  const script = `
    import childProcess from 'node:child_process'
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    const read = fs.readFileSync
    fs.readFileSync = (file, ...rest) => {
      if (file === '/proc/self/stat') throw new Error('no /proc')
      return read(file, ...rest)
    }
    let answer = ''
    childProcess.spawnSync = () => ({ stdout: answer, error: undefined })
    syncBuiltinESMExports()
    const { isTerminalOwner } = await import('./src/isTerminalOwner/index.ts')
    const other = process.pid + 1
    const owns = []
    for (const [foreground, group] of [[process.pid, process.pid], [other, other], [other, process.pid]]) {
      answer = foreground + ' ' + group + '\\n'
      owns.push(isTerminalOwner())
    }
    process.stdout.write(JSON.stringify(owns))
  `
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { encoding: 'utf8' }
  )
  assert.equal(child.status, 0, child.stderr)
  assert.deepEqual(JSON.parse(child.stdout), [true, false, false])
})
