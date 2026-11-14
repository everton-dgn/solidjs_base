import 'server-only'

type FailureSource =
  | 'server-operation'
  | 'server-error'
  | 'middleware'
  | 'error-page'
  | 'sitemap'
  | 'llms'
type FailureLog = {
  source: FailureSource
  error?: unknown
  shouldPrintOriginal?: boolean
}
type NameCheck = { error: Error; name: string }

const MAX_FRAMES = 10
const MAX_STACK_LINES = 50
const MAX_LINE_LENGTH = 1024
const CLASS_NAME = /^[A-Za-z_$][\w$]{0,63}$/u
// V8 headers can include an internal Node code, such as
// "TypeError [ERR_INVALID_ARG_TYPE]".
const HEADER_NAME = /^[\w$.]{1,64}(?: \[[A-Z][A-Z0-9_]{0,63}\])?/u
const SIMPLE_NAME = /^[\w$.]{1,64}$/u
const NODE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u
// V8 file, node: and absolute-path locations must end in :line:column,
// without spaces, parentheses or Unicode control/format characters.
// Function names allow async, new, <anonymous> and [as name].
const CALL_FRAME =
  /^ {4}at [\w$.<>[\] ]+ \((?:file:\/\/|node:|\/)[^\s()\p{C}]*:\d+:\d+\)$/u
const LOCATION_FRAME =
  /^ {4}at (?:async )?(?:file:\/\/|node:|\/)[^\s()\p{C}]*:\d+:\d+$/u

function className(error: Error): string | undefined {
  const prototype: unknown = Object.getPrototypeOf(error)
  if (typeof prototype !== 'object' || prototype === null) return undefined
  const owner = 'constructor' in prototype ? prototype.constructor : undefined
  if (typeof owner !== 'function') return undefined
  const name: unknown = Reflect.get(owner, 'name')
  return typeof name === 'string' && CLASS_NAME.test(name) ? name : undefined
}

function isFrame(line: string): boolean {
  return (
    line.length <= MAX_LINE_LENGTH &&
    (CALL_FRAME.test(line) || LOCATION_FRAME.test(line))
  )
}

// Require the entire current name, optionally followed by a Node code.
// Otherwise a newline in name/code could turn a header line into a frame.
function isCurrentName({ error, name }: NameCheck): boolean {
  const current: unknown = Reflect.get(error, 'name')
  if (typeof current !== 'string' || !SIMPLE_NAME.test(current)) return false
  if (name === current) return true
  const code: unknown = Reflect.get(error, 'code')
  return (
    typeof code === 'string' &&
    NODE_CODE.test(code) &&
    name === `${current} [${code}]`
  )
}

// Require the header built from the current name and message. Without it,
// a message line could masquerade as a frame.
function stackFrames(error: Error): string[] {
  const stack: unknown = Reflect.get(error, 'stack')
  const message: unknown = Reflect.get(error, 'message')
  if (typeof stack !== 'string' || typeof message !== 'string') return []
  const [name] = HEADER_NAME.exec(stack) ?? []
  if (name === undefined || !isCurrentName({ error, name })) return []
  const header = message === '' ? name : `${name}: ${message}`
  if (!stack.startsWith(`${header}\n`)) return []
  return stack
    .slice(header.length + 1)
    .split('\n', MAX_STACK_LINES)
    .filter(line => isFrame(line))
    .slice(0, MAX_FRAMES)
}

// Inspection failure discards both class and frames, leaving only the fixed line.
function errorDetails(error: unknown): string[] {
  try {
    if (!(error instanceof Error)) return []
    const name = className(error)
    const frames = stackFrames(error)
    return name === undefined ? frames : [name, ...frames]
  } catch {
    return []
  }
}

export function logServerFailure({
  source,
  error,
  shouldPrintOriginal = false
}: FailureLog): void {
  // Never include the error message, cause or properties in the source line.
  const line = `[${source}] Unexpected failure; private details omitted`
  try {
    console.error([line, ...errorDetails(error)].join('\n'))
  } catch {
    // The retry neither inspects the error nor uses the destination failure.
    try {
      console.error(line)
    } catch {
      // No log destination is available.
    }
  }
  // Even explicit callers cannot request the original error in production.
  if (!shouldPrintOriginal || !import.meta.env.DEV) return
  try {
    console.error(error)
  } catch {
    // Formatting can also throw through a getter or Proxy.
  }
}
