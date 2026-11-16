import type { Session } from './types.ts'

type Attempt<Result> = () => Promise<Result | undefined>

type Wait<Result> = {
  session: Session
  timeout: number
  attempt: Attempt<Result>
  describeTimeout: () => string
}

type Read<Result> = { session: Session; read: () => Promise<Result> }

const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const READ_AGAIN_TIMEOUT = 120_000

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
  const rounded = Math.round(milliseconds)
  if (rounded < MILLISECONDS_PER_SECOND) return `${rounded} millisecond(s)`
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

// WHY: a read right after a write, such as the new head after an update or the
// manifest after a merge, would otherwise end the command on one HTTP 502 and
// leave the write without its check.
export async function readAgain<Result>({
  session,
  read
}: Read<Result>): Promise<Result> {
  let failure = ''
  const { value } = await waitFor({
    session,
    timeout: READ_AGAIN_TIMEOUT,
    describeTimeout: () =>
      `${failure} Stopped reading again after ${describeDuration(READ_AGAIN_TIMEOUT)}.`,
    attempt: async () => {
      try {
        return { value: await read() }
      } catch (error) {
        if (error instanceof PassingReadError) failure = error.message
        throw error
      }
    }
  })
  return value
}
