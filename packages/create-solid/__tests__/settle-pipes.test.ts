import assert from 'node:assert/strict'
import { ChildProcess } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { PassThrough } from 'node:stream'
import { it } from 'node:test'

import { settlePipes } from '../src/settlePipes/index.ts'

type ExitedChild = { child: ChildProcess; stdout: PassThrough }
type Settling = {
  settledAt: Promise<number | undefined>
  onSettled: () => void
}
// The short silence of src/settlePipes.
const quietMs = 500
const limitFactor = 3
function exitedChild(): ExitedChild {
  const stdout = new PassThrough()
  const child = new ChildProcess()
  child.stdout = stdout
  return { child, stdout }
}
function settling(limitMs: number): Settling {
  const { promise, resolve } = Promise.withResolvers<number | undefined>()
  const limit = setTimeout(resolve, limitMs, undefined)
  return {
    settledAt: promise,
    onSettled: () => {
      clearTimeout(limit)
      resolve(performance.now())
    }
  }
}

void it('lets go after a short silence when the write an output waited for failed', async () => {
  // The state Node leaves in process.stdout once a write that waited for drain failed: it still asks for drain, with nothing left to write.
  const failed = { writableNeedDrain: true, writableLength: 0 }
  const boundMs = 4000
  const { child } = exitedChild()
  const started = performance.now()
  const { settledAt, onSettled } = settling(boundMs * limitFactor)
  settlePipes({ child, outputs: [failed], boundMs, onSettled })
  const settled = (await settledAt) ?? Infinity
  child.emit('close')
  assert.ok(settled - started < quietMs * limitFactor)
})
