import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { it } from 'node:test'
import { setImmediate, setTimeout } from 'node:timers/promises'

import { setRunningTimeout } from '../src/setRunningTimeout/index.ts'

// A late tick counts as one tick of src/setRunningTimeout.
const tickMs = 250
const held = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))

void it('leaves out of the delay all but one tick of a time the loop did not run, as during a stop', async () => {
  const delayMs = 600
  const stoppedMs = 1500
  const { promise, resolve } = Promise.withResolvers<number>()
  setRunningTimeout({ delayMs, onExpire: () => resolve(performance.now()) })
  Atomics.wait(held, 0, 0, stoppedMs)
  const resumed = performance.now()
  assert.ok((await promise) - resumed >= delayMs - tickMs)
})

void it('counts at most one tick of each short stop', async () => {
  const delayMs = 1000
  const stoppedMs = 900
  const stops = 3
  const state = { hasExpired: false }
  const { promise, resolve } = Promise.withResolvers<number>()
  setRunningTimeout({
    delayMs,
    onExpire: () => {
      state.hasExpired = true
      resolve(performance.now())
    }
  })
  // Each stop ends in a turn of the loop whose timers run before the next stop.
  for (let stop = 0; stop < stops; stop += 1) {
    await setImmediate()
    Atomics.wait(held, 0, 0, stoppedMs)
  }
  await setImmediate()
  assert.equal(state.hasExpired, false)
  await promise
})

void it('expires once the loop ran for the delay', async () => {
  const delayMs = 300
  const started = performance.now()
  const { promise, resolve } = Promise.withResolvers<number>()
  setRunningTimeout({ delayMs, onExpire: () => resolve(performance.now()) })
  assert.ok((await promise) - started >= delayMs)
})

void it('never expires once cleared', async () => {
  const delayMs = 300
  const waitedMs = 600
  let hasExpired = false
  const timer = setRunningTimeout({
    delayMs,
    onExpire: () => {
      hasExpired = true
    }
  })
  clearInterval(timer)
  await setTimeout(waitedMs)
  assert.equal(hasExpired, false)
})
