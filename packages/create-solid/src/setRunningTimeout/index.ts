import { performance } from 'node:perf_hooks'

const tickMs = 250
type RunningTimeout = {
  delayMs: number
  onExpire: () => void
  shouldCount?: () => boolean
}
// WHY: The timers of Node go on counting while the process is stopped, and after SIGCONT an expired timer runs before the loop reads the signal. A late tick counts as one tick, so each stop, short or long, counts at most one, and a loop that runs late only lengthens the delay.
export function setRunningTimeout({
  delayMs,
  onExpire,
  shouldCount = () => true
}: RunningTimeout): ReturnType<typeof setInterval> {
  let ranMs = 0
  let last = performance.now()
  const timer = setInterval(() => {
    const now = performance.now()
    if (shouldCount()) ranMs += Math.min(now - last, tickMs)
    last = now
    if (ranMs < delayMs) return
    clearInterval(timer)
    onExpire()
  }, tickMs)
  return timer
}
