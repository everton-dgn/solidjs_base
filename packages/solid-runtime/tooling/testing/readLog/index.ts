type LogRead = { heads: string[][]; leaks: string[] }
type LogSpy = (...data: unknown[]) => void

// The fixed source line and, for an Error, its class.
const LOG_HEAD_LINES = 2

// Checks every argument and line, including frames, for private markers.
// The caller passes the spy because only test files may access console.
export function readLog(spy: LogSpy): LogRead {
  const calls: unknown[][] = vi.mocked(spy).mock.calls
  return {
    heads: calls.map(([entry, ...rest]) =>
      typeof entry === 'string' && rest.length === 0
        ? entry.split('\n').slice(0, LOG_HEAD_LINES)
        : ['unexpected arguments']
    ),
    leaks: JSON.stringify(calls).match(/PRIVATE\w*/gu) ?? []
  }
}
