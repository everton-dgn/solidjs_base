import type { ChildProcess } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

// WHY: What the installer wrote before it exited may still wait in its pipes while the reader of this output is slow, and a process it started, such as a lifecycle script that outlives bun, may keep those pipes open with nothing more to write.
const quietMs = 500
type PipeSettling = {
  child: ChildProcess
  boundMs: number
  onSettled: () => void
}
function isOutputHeld(): boolean {
  return [process.stdout, process.stderr].some(
    output => output.writableNeedDrain
  )
}
export function settlePipes({ child, boundMs, onSettled }: PipeSettling): void {
  const exitedAt = performance.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const wait = () => {
    clearTimeout(timer)
    timer = undefined
    if (performance.now() - exitedAt >= boundMs) {
      onSettled()
      return
    }
    timer = setTimeout(() => {
      if (isOutputHeld()) {
        wait()
        return
      }
      const settling = timer
      // WHY: A write that held the loop leaves this timer due before the loop reads the pipes again.
      setImmediate(() => {
        if (timer === settling) onSettled()
      })
    }, quietMs)
  }
  for (const source of [child.stdout, child.stderr]) source?.on('data', wait)
  child.once('close', () => clearTimeout(timer))
  wait()
}
