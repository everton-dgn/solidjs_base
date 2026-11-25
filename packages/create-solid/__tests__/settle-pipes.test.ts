import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { ChildProcess } from 'node:child_process'
import { stat } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { PassThrough } from 'node:stream'
import { it } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { settlePipes } from '../src/settlePipes/index.ts'

type ExitedChild = { child: ChildProcess; stdout: PassThrough }
type Settling = {
  settledAt: Promise<number | undefined>
  onSettled: () => void
}
// The short silence of src/settlePipes.
const quietMs = 500
// WHY: Node arms a timer from the time of the turn of the loop, which may come a few milliseconds before performance.now().
const timerSlackMs = 50
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

void it('counts no time while an output holds bytes for its reader', async () => {
  const output = { writableNeedDrain: true, writableLength: 1 }
  const boundMs = 300
  const heldMs = 1500
  const { child } = exitedChild()
  const { settledAt, onSettled } = settling(heldMs * limitFactor)
  const state = { isSettled: false }
  settlePipes({
    child,
    outputs: [output],
    boundMs,
    onSettled: () => {
      state.isSettled = true
      onSettled()
    }
  })
  await delay(heldMs)
  assert.equal(state.isSettled, false)
  output.writableNeedDrain = false
  output.writableLength = 0
  const settled = await settledAt
  child.emit('close')
  assert.notEqual(settled, undefined)
})

void it('lets go once the output took data for the bound while data keeps coming', async () => {
  const boundMs = 600
  const feedMs = 100
  const { child, stdout } = exitedChild()
  const feed = setInterval(() => stdout.emit('data', Buffer.from('x')), feedMs)
  const started = performance.now()
  const { settledAt, onSettled } = settling(boundMs * limitFactor)
  settlePipes({ child, outputs: [], boundMs, onSettled })
  const settled = (await settledAt) ?? Infinity
  clearInterval(feed)
  child.emit('close')
  assert.ok(settled - started >= boundMs - timerSlackMs)
  assert.ok(settled - started < boundMs * limitFactor)
})

void it('lets go once more came after the exit than the pipes and the buffers hold, while the output holds bytes', async () => {
  const output = { writableNeedDrain: true, writableLength: 1 }
  const chunkBytes = 65_536
  const chunks = 128
  // Two pipes of 64 KiB and the buffers of the CLI hold a few hundred KiB, well below 2 MiB.
  const heldBytes = 2_097_152
  const { child, stdout } = exitedChild()
  const { settledAt, onSettled } = settling(quietMs * limitFactor)
  const state = { sent: 0, settledAfter: 0 }
  settlePipes({
    child,
    outputs: [output],
    boundMs: 60_000,
    onSettled: () => {
      state.settledAfter = state.sent
      onSettled()
    }
  })
  const chunk = Buffer.alloc(chunkBytes)
  for (let index = 0; index < chunks; index += 1) {
    state.sent += chunk.length
    stdout.emit('data', chunk)
  }
  child.emit('close')
  assert.notEqual(await settledAt, undefined)
  assert.ok(state.settledAfter > heldBytes, String(state.settledAfter))
  assert.ok(state.settledAfter < state.sent, String(state.settledAfter))
})

void it('lets go once nothing came for a short time', async () => {
  const { child } = exitedChild()
  const started = performance.now()
  const { settledAt, onSettled } = settling(quietMs * limitFactor)
  settlePipes({ child, outputs: [], boundMs: 60_000, onSettled })
  const settled = (await settledAt) ?? Infinity
  child.emit('close')
  assert.ok(settled - started >= quietMs - timerSlackMs)
  assert.ok(settled - started < quietMs * limitFactor)
})

void it('counts the short time again from each chunk while the output takes data', async () => {
  const { child, stdout } = exitedChild()
  const gapMs = 300
  const chunks = 2
  const started = performance.now()
  const { settledAt, onSettled } = settling(quietMs * limitFactor * chunks)
  settlePipes({ child, outputs: [], boundMs: 60_000, onSettled })
  for (let index = 0; index < chunks; index += 1) {
    await delay(gapMs)
    stdout.emit('data', Buffer.from('x'))
  }
  const settled = (await settledAt) ?? Infinity
  child.emit('close')
  assert.ok(settled - started >= gapMs * chunks + quietMs - timerSlackMs)
})

void it('reads what came while the loop was held before it lets go', async () => {
  const { child, stdout } = exitedChild()
  const overdueMs = 300
  const heldMs = quietMs + overdueMs
  const events: string[] = []
  const { settledAt, onSettled } = settling(quietMs * limitFactor * limitFactor)
  settlePipes({
    child,
    outputs: [],
    boundMs: 60_000,
    onSettled: () => {
      events.push('settled')
      onSettled()
    }
  })
  setImmediate(() => {
    // The read of the file ends while the loop is held, so its callback runs right after the due timer.
    stat(import.meta.filename, () => {
      events.push('data')
      stdout.emit('data', Buffer.from('x'))
    })
    const held = new Int32Array(
      new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    )
    Atomics.wait(held, 0, 0, heldMs)
  })
  await settledAt
  child.emit('close')
  assert.deepEqual(events, ['data', 'settled'])
})
