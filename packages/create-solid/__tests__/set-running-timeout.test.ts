import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { it } from 'node:test'
import { setTimeout } from 'node:timers/promises'

import { setRunningTimeout } from '../src/setRunningTimeout/index.ts'

void it('leaves out of the delay a time the loop did not run, as during a stop', async () => {
  const delayMs = 600
  const stoppedMs = 1500
  const { promise, resolve } = Promise.withResolvers<number>()
  setRunningTimeout({ delayMs, onExpire: () => resolve(performance.now()) })
  const held = new Int32Array(
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  )
  Atomics.wait(held, 0, 0, stoppedMs)
  const resumed = performance.now()
  assert.ok((await promise) - resumed >= delayMs)
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
