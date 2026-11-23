import { setImmediate } from 'node:timers/promises'

// WHY: libuv drops a signal it has read but not dispatched when the last listener of that signal is removed. The first turn may end in the loop iteration that is running, so the second one puts a whole read of the signal pipe in between.
export async function readPendingSignals(): Promise<void> {
  await setImmediate()
  await setImmediate()
}
