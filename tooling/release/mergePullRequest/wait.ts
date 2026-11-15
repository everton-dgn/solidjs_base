import type { Session } from './types.ts'

type Wait<Result> = {
  session: Session
  timeout: number
  attempt: () => Promise<Result | undefined>
  describeTimeout: () => string
}

const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60

export function describeDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / MILLISECONDS_PER_SECOND)
  return seconds % SECONDS_PER_MINUTE === 0
    ? `${seconds / SECONDS_PER_MINUTE} minute(s)`
    : `${seconds} second(s)`
}

export async function waitFor<Result>({
  session,
  timeout,
  attempt,
  describeTimeout
}: Wait<Result>): Promise<Result> {
  const { now, sleep } = session.environment
  const deadline = now() + timeout
  for (;;) {
    const result = await attempt()
    if (result !== undefined) return result
    if (now() >= deadline) throw new Error(describeTimeout())
    await sleep(session.timing.interval)
  }
}
