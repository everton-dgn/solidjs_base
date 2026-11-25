import { performance } from 'node:perf_hooks'

const tickMs = 250
const stopGapMs = 1000
type RunningTimeout = {
  delayMs: number
  onExpire: () => void
  shouldCount?: () => boolean
}
// WHY: The timers of Node go on counting while the process is stopped, and after SIGCONT an expired timer runs before the loop reads the signal. Ticks much further apart than planned mark a stop, whose time does not count.
export function setRunningTimeout({
  delayMs,
  onExpire,
  shouldCount = () => true
}: RunningTimeout): ReturnType<typeof setInterval> {
  let ranMs = 0
  let last = performance.now()
  const timer = setInterval(() => {
    const now = performance.now()
    const gapMs = now - last
    last = now
    if (gapMs < stopGapMs && shouldCount()) ranMs += gapMs
    if (ranMs < delayMs) return
    clearInterval(timer)
    onExpire()
  }, tickMs)
  return timer
}
