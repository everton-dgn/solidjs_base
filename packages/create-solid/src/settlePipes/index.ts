import { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

import { setRunningTimeout } from '../setRunningTimeout/index.ts'

// WHY: What the installer wrote before it exited may still wait in its pipes while the reader of this output is slow, and a process it started, such as a lifecycle script that outlives bun, may keep those pipes open with nothing more to write.
const quietMs = 500
// WHY: Once the installer has exited, what its pipes and the buffers of the CLI still hold of its own output is far below these 4 MiB, so more comes from a process it started.
const descendantBytes = 4_194_304
type HeldOutput = Pick<Writable, 'writableNeedDrain' | 'writableLength'>
type SourceSettling = {
  source: Readable
  output: HeldOutput | undefined
  boundMs: number
  onSettled: () => void
}
function settleSource({
  source,
  output,
  boundMs,
  onSettled
}: SourceSettling): () => void {
  // A failed write can leave the request for drain set with no queued bytes.
  const isOutputHeld = () =>
    output !== undefined &&
    output.writableNeedDrain &&
    output.writableLength > 0
  let readBytes = 0
  let bound: ReturnType<typeof setInterval> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: ReturnType<typeof setImmediate> | undefined
  const finish = () => {
    if (bound) onSettled()
  }
  const cut = () => {
    source.destroy()
    finish()
  }
  const clearSilence = () => {
    clearTimeout(timer)
    clearImmediate(pending)
  }
  const wait = () => {
    clearSilence()
    timer = setTimeout(() => {
      if (isOutputHeld()) {
        wait()
        return
      }
      // Let ready reads run before confirming silence after a delayed timer.
      pending = setImmediate(() => {
        if (isOutputHeld()) wait()
        else cut()
      })
    }, quietMs)
  }
  const read = (chunk: Buffer | string) => {
    readBytes += Buffer.byteLength(chunk)
    if (readBytes > descendantBytes) cut()
    else wait()
  }
  const stop = () => {
    clearInterval(bound)
    bound = undefined
    clearSilence()
    source.off('data', read)
    source.off('end', finish)
    source.off('close', finish)
  }
  bound = setRunningTimeout({
    delayMs: boundMs,
    onExpire: cut,
    shouldCount: () => !isOutputHeld()
  })
  source.on('data', read)
  source.once('end', finish)
  source.once('close', finish)
  wait()
  return stop
}

type PipeSettling = {
  child: ChildProcess
  outputs: { stdout?: HeldOutput; stderr?: HeldOutput }
  boundMs: number
  onSettled: () => void
}
export function settlePipes({
  child,
  outputs,
  boundMs,
  onSettled
}: PipeSettling): () => void {
  const active = new Set<() => void>()
  const stopAll = () => {
    child.off('close', stopAll)
    for (const stop of active) stop()
    active.clear()
  }
  const include = (source: Readable | null, output: HeldOutput | undefined) => {
    if (!source || source.readableEnded || source.destroyed) return
    const stop = settleSource({
      source,
      output,
      boundMs,
      onSettled: () => {
        if (!active.delete(stop)) return
        stop()
        if (active.size > 0) return
        stopAll()
        onSettled()
      }
    })
    active.add(stop)
  }
  include(child.stdout, outputs.stdout)
  include(child.stderr, outputs.stderr)
  if (active.size > 0) child.once('close', stopAll)
  else onSettled()
  return stopAll
}
