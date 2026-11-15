import type { Session } from './types.ts'

type Attempt<Result> = () => Promise<Result | undefined>

type Wait<Result> = {
  session: Session
  timeout: number
  attempt: Attempt<Result>
  describeTimeout: () => string
}

const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60

// A read that failed for a reason that passes, such as an HTTP 502. A wait
// counts it as one more attempt within the deadline and stops on any other
// error.
export class PassingReadError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'PassingReadError'
  }
}

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
  const { now, sleep, log } = session.environment
  const deadline = now() + timeout
  for (;;) {
    let result: Result | undefined
    try {
      result = await attempt()
    } catch (error) {
      if (!(error instanceof PassingReadError)) throw error
      log(`  ${error.message} Reading again.`)
    }
    if (result !== undefined) return result
    if (now() >= deadline) throw new Error(describeTimeout())
    await sleep(session.timing.interval)
  }
}
