import type { ChildProcess } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import type { Writable } from 'node:stream'

// WHY: What the installer wrote before it exited may still wait in its pipes while the reader of this output is slow, and a process it started, such as a lifecycle script that outlives bun, may keep those pipes open with nothing more to write.
const quietMs = 500
type HeldOutput = Pick<Writable, 'writableNeedDrain' | 'writableLength'>
type PipeSettling = {
  child: ChildProcess
  outputs: HeldOutput[]
  boundMs: number
  onSettled: () => void
}
export function settlePipes({
  child,
  outputs,
  boundMs,
  onSettled
}: PipeSettling): void {
  // WHY: Node clears the request for drain only after a write that succeeds, so an output whose waiting write failed still asks for it with nothing left to write.
  const isOutputHeld = () =>
    outputs.some(
      output => output.writableNeedDrain && output.writableLength > 0
    )
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
