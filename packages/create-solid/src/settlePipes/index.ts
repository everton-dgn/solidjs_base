import { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type { Writable } from 'node:stream'

import { setRunningTimeout } from '../setRunningTimeout/index.ts'

// WHY: What the installer wrote before it exited may still wait in its pipes while the reader of this output is slow, and a process it started, such as a lifecycle script that outlives bun, may keep those pipes open with nothing more to write.
const quietMs = 500
// WHY: Once the installer has exited, what its pipes and the buffers of the CLI still hold of its own output is far below these 4 MiB, so more comes from a process it started.
const descendantBytes = 4_194_304
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
  let readBytes = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let isSettled = false
  const settle = () => {
    clearTimeout(timer)
    timer = undefined
    if (isSettled) return
    isSettled = true
    onSettled()
  }
  // WHY: While the output holds bytes the CLI waits for its reader, however slow or stopped, so only the time the output takes data counts, which is when a process the installer started can keep writing.
  const bound = setRunningTimeout({
    delayMs: boundMs,
    onExpire: settle,
    shouldCount: () => !isOutputHeld()
  })
  const wait = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (isOutputHeld()) {
        wait()
        return
      }
      const settling = timer
      // WHY: A write that held the loop leaves this timer due before the loop reads the pipes again.
      setImmediate(() => {
        if (timer === settling) settle()
      })
    }, quietMs)
  }
  const read = (chunk: Buffer | string) => {
    readBytes += Buffer.byteLength(chunk)
    if (readBytes > descendantBytes) {
      settle()
      return
    }
    wait()
  }
  for (const source of [child.stdout, child.stderr]) source?.on('data', read)
  child.once('close', () => {
    clearTimeout(timer)
    clearInterval(bound)
  })
  wait()
}
