import { hostileValue, throwValue } from '@testing/failureValues/index.ts'
import { readLog } from '@testing/readLog/index.ts'

import { logServerFailure } from '../index.ts'

const MESSAGE = '[middleware] Unexpected failure; private details omitted'
const LOG_ATTEMPTS = 2
// Limits for emitted frames, scanned lines and inspected line length.
const FRAME_LIMIT = 10
const READ_LIMIT = 50
const LINE_LIMIT = 1024
// The synthetic stack contains more valid frames than the output limit.
const SYNTHETIC_FRAMES = 15
// First frame of an error created in this file.
const LOCAL_FRAME = /^ {4}at .+logServerFailure\.node\.test\.ts:\d+:\d+\)?$/u
const LATE_FRAME = '    at late (file:///app/server.js:1:1)'
const PLAIN_FRAME = '    at handler (/app/server.js:1:1)'
// A frame-shaped line injected into an error name or code.
const INJECTED_FRAME = '    at /PRIVATE_HEADER:1:1'

type ErrorClass = new (message: string) => Error

// V8 reads the current name when it formats the stack for the first time.
class UpstreamError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'UpstreamError'
  }
}

// Returning the anonymous class avoids inferring its name from a variable.
function anonymousErrorClass(): ErrorClass {
  return class extends Error {}
}

// The log contract requires exactly one call with a single string.
function loggedText(): string {
  const calls: unknown[][] = vi.mocked(console.error).mock.calls
  const [call] = calls
  const [entry] = call ?? []
  if (calls.length !== 1 || call?.length !== 1 || typeof entry !== 'string') {
    throw new TypeError('Expected one log call with a single string')
  }
  return entry
}

function loggedLines(): string[] {
  return loggedText().split('\n')
}

function caughtError(run: () => unknown): Error {
  try {
    run()
  } catch (error) {
    if (error instanceof Error) return error
  }
  throw new Error('Expected the operation to throw an Error')
}

function textDecoderError(): Error {
  return caughtError(() => new TextDecoder('PRIVATE_LABEL'))
}

// Vitest replaces Error.prepareStackTrace with the Vite formatter, which
// omits Node codes and writes "Error: " for empty messages. Restore Node
// formatting only while creating and first reading this fixture stack.
function formattedByNode(create: () => Error): Error {
  const formatter = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace')
  Reflect.deleteProperty(Error, 'prepareStackTrace')
  try {
    const error = create()
    if (typeof error.stack !== 'string') throw new TypeError('Expected a stack')
    return error
  } finally {
    if (formatter) Object.defineProperty(Error, 'prepareStackTrace', formatter)
  }
}

// A forged stack must imitate both the V8 header and frame grammar.
function withStack(lines: string[]): Error {
  return Object.assign(new Error('PRIVATE_MESSAGE'), {
    stack: ['Error: PRIVATE_MESSAGE', ...lines].join('\n')
  })
}

// A valid frame of the exact requested length.
function frameOfLength(length: number): string {
  const prefix = '    at handler (/'
  const suffix = '.js:1:1)'
  return `${prefix}${'a'.repeat(length - prefix.length - suffix.length)}${suffix}`
}

function hostileError(): Error {
  return new Proxy(new Error('PRIVATE_MESSAGE'), {
    get: () => throwValue(new Error('PRIVATE_GET'))
  })
}

function throwingStack(): Error {
  return Object.defineProperty(new Error('PRIVATE_MESSAGE'), 'stack', {
    get: () => throwValue(new Error('PRIVATE_STACK'))
  })
}

describe('fixed failure log line', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it.each([
    [
      'server-operation',
      '[server-operation] Unexpected failure; private details omitted'
    ],
    [
      'server-error',
      '[server-error] Unexpected failure; private details omitted'
    ],
    ['middleware', MESSAGE],
    ['error-page', '[error-page] Unexpected failure; private details omitted'],
    ['sitemap', '[sitemap] Unexpected failure; private details omitted']
  ] as const)(
    'logs only the fixed line for %s without an error',
    (source, message) => {
      logServerFailure({ source })
      expect(console.error).toHaveBeenCalledExactlyOnceWith(message)
    }
  )

  it.each([
    ['a string', 'PRIVATE_STRING'],
    [
      'a plain object',
      {
        message: 'PRIVATE_MESSAGE',
        stack: 'Error: PRIVATE_MESSAGE\n    at /PRIVATE_FRAME:1:1'
      }
    ],
    ['a Proxy whose prototype access throws', hostileValue()],
    ['an Error Proxy whose reads throw', hostileError()],
    ['an Error whose stack getter throws', throwingStack()]
  ])('logs only the fixed line for %s', (_label, error) => {
    logServerFailure({ source: 'middleware', error })
    expect(console.error).toHaveBeenCalledExactlyOnceWith(MESSAGE)
  })
})

describe('log destination failures', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('retries only the fixed line without inspecting the error again', () => {
    const readStack = vi.fn<() => string>(
      () => `Error: PRIVATE_MESSAGE\n${PLAIN_FRAME}`
    )
    const error = Object.defineProperty(
      new Error('PRIVATE_MESSAGE', { cause: 'PRIVATE_CAUSE' }),
      'stack',
      { get: readStack }
    )
    vi.mocked(console.error).mockImplementationOnce(() => {
      throw new Error('PRIVATE_DESTINATION')
    })

    expect(() =>
      logServerFailure({ source: 'middleware', error })
    ).not.toThrow()

    expect(readStack).toHaveBeenCalledOnce()
    expect(readLog(console.error)).toStrictEqual({
      heads: [[MESSAGE, 'Error'], [MESSAGE]],
      leaks: []
    })
  })

  it('stops after two destination failures without propagating them', () => {
    vi.mocked(console.error)
      .mockImplementationOnce(() => {
        throw new Error('PRIVATE_FIRST_DESTINATION')
      })
      .mockImplementationOnce(() => {
        throw new Error('PRIVATE_SECOND_DESTINATION')
      })

    try {
      expect(() =>
        logServerFailure({ source: 'middleware', error: new Error('PRIVATE') })
      ).not.toThrow()

      expect(readLog(console.error)).toStrictEqual({
        heads: [[MESSAGE, 'Error'], [MESSAGE]],
        leaks: []
      })
    } finally {
      vi.mocked(console.error).mockReset()
    }
  })

  it('contains failures while accessing the destination', () => {
    const descriptor = Object.getOwnPropertyDescriptor(console, 'error')
    assert(descriptor)
    const readError = vi.fn<() => never>(() => {
      throw new Error('PRIVATE_CONSOLE_ACCESS')
    })
    Object.defineProperty(console, 'error', {
      configurable: true,
      get: readError
    })
    try {
      expect(() => logServerFailure({ source: 'middleware' })).not.toThrow()
      expect(readError).toHaveBeenCalledTimes(LOG_ATTEMPTS)
    } finally {
      Object.defineProperty(console, 'error', descriptor)
    }
  })
})

describe('original errors in development', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('prints the original after the fixed line when requested in development', () => {
    vi.stubEnv('DEV', true)
    const error = new Error('PRIVATE')

    logServerFailure({ source: 'middleware', error, shouldPrintOriginal: true })

    expect(readLog(console.error).heads[0]).toStrictEqual([MESSAGE, 'Error'])
    expect(vi.mocked(console.error).mock.calls.slice(1)).toStrictEqual([
      [error]
    ])
  })

  it.each([
    ['outside development', false, true],
    ['without a caller request', true, false]
  ])(
    'does not print the original error %s',
    (_label, isDevelopment, shouldPrint) => {
      vi.stubEnv('DEV', isDevelopment)

      logServerFailure({
        source: 'middleware',
        error: new Error('PRIVATE'),
        shouldPrintOriginal: shouldPrint
      })

      expect(readLog(console.error)).toStrictEqual({
        heads: [[MESSAGE, 'Error']],
        leaks: []
      })
    }
  )

  it('contains a failure while printing the original error', () => {
    vi.stubEnv('DEV', true)
    vi.mocked(console.error)
      .mockImplementationOnce(vi.fn())
      .mockImplementationOnce(() => {
        throw new Error('PRIVATE_DESTINATION')
      })

    expect(() =>
      logServerFailure({
        source: 'middleware',
        error: new Error('PRIVATE'),
        shouldPrintOriginal: true
      })
    ).not.toThrow()
  })
})

describe('failure log class and frames', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('logs class and frames without message, cause or properties', () => {
    const error = Object.assign(
      new Error('PRIVATE_MESSAGE', { cause: 'PRIVATE_CAUSE' }),
      { internalContext: 'PRIVATE_CONTEXT' }
    )

    logServerFailure({ source: 'middleware', error })

    const [first, name, ...frames] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'Error'])
    expect(frames[0]).toMatch(LOCAL_FRAME)
    expect(frames.every(frame => frame.startsWith('    at '))).toBe(true)
    expect(loggedText()).not.toContain('PRIVATE')
  })

  it('does not treat a message line as a frame', () => {
    const error = new Error('PRIVATE_MESSAGE\n    at /segredo:1:1')
    // Positive control: the forged line is in the stack after the header.
    expect(error.stack).toContain('PRIVATE_MESSAGE\n    at /segredo:1:1\n')

    logServerFailure({ source: 'middleware', error })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'Error'])
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toMatch(/segredo|PRIVATE/u)
  })

  it('drops frames from an overwritten stack without its header', () => {
    const error = Object.assign(new Error('PRIVATE_MESSAGE'), {
      stack: '    at /segredo:1:1\n    at file:///PRIVATE_FRAME.js:1:1'
    })

    logServerFailure({ source: 'middleware', error })

    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${MESSAGE}\nError`)
  })

  it('drops frames when the message changes after stack formatting', () => {
    const error = new Error('PRIVATE_BEFORE')
    // V8 caches the header on the first stack read; a later message change
    // no longer matches that header.
    expect(error.stack).toMatch(/^Error: PRIVATE_BEFORE\n/u)
    error.message = 'PRIVATE_AFTER'

    logServerFailure({ source: 'middleware', error })

    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${MESSAGE}\nError`)
  })

  it('reads the class from the prototype instead of an own property', () => {
    const error = Object.assign(new TypeError('PRIVATE_MESSAGE'), {
      constructor: { name: 'SEGREDO' }
    })

    logServerFailure({ source: 'middleware', error })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'TypeError'])
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toMatch(/SEGREDO|PRIVATE/u)
  })

  it('validates and logs the same class name read', () => {
    const Failure = anonymousErrorClass()
    const error = new Failure('PRIVATE_MESSAGE')
    const readName = vi
      .fn<() => unknown>()
      .mockReturnValueOnce('Error')
      .mockReturnValue('PRIVATE_CLASS_NAME')
    Object.defineProperty(Failure, 'name', { get: readName })

    logServerFailure({ source: 'middleware', error })

    expect(readName).toHaveBeenCalledOnce()
    expect(readLog(console.error)).toStrictEqual({
      heads: [[MESSAGE, 'Error']],
      leaks: []
    })
  })

  it('rejects class names requiring string coercion', () => {
    const Failure = anonymousErrorClass()
    const error = Object.assign(new Failure('PRIVATE_MESSAGE'), {
      stack: `Error: PRIVATE_MESSAGE\n${PLAIN_FRAME}`
    })
    const convert = vi
      .fn<() => string>()
      .mockReturnValueOnce('Error')
      .mockReturnValue('PRIVATE_COERCION')
    Object.defineProperty(Failure, 'name', { value: { toString: convert } })

    logServerFailure({ source: 'middleware', error })

    expect(convert).not.toHaveBeenCalled()
    expect(loggedLines()).toStrictEqual([MESSAGE, PLAIN_FRAME])
  })

  it.each([
    [
      'a class changing name after super()',
      () => new UpstreamError('PRIVATE_MESSAGE'),
      'UpstreamError'
    ],
    [
      'a name changed after construction',
      () =>
        Object.assign(new RangeError('PRIVATE_MESSAGE'), {
          name: 'PRIVATE_NAME'
        }),
      'RangeError'
    ]
  ])('keeps frames with %s without logging name', (_label, create, type) => {
    logServerFailure({ source: 'middleware', error: create() })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, type])
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toContain('PRIVATE')
  })

  it('accepts internal Node error codes in the header', () => {
    const error = formattedByNode(textDecoderError)
    // Positive control: the header includes the bracketed Node code.
    expect(error.stack).toMatch(/^RangeError \[ERR_ENCODING_NOT_SUPPORTED\]: /u)

    logServerFailure({ source: 'middleware', error })

    const [first, name, frame] = loggedLines()
    expect([first, name]).toStrictEqual([MESSAGE, 'RangeError'])
    expect(frame).toMatch(/^ {4}at new TextDecoder \(node:/u)
    expect(loggedText()).not.toContain('PRIVATE')
  })

  // Reading only up to the newline would let injected header lines pass as
  // frames without checking the entire current name and code.
  it.each([
    [
      'a name with a newline and empty message',
      () =>
        Object.assign(new Error('PRIVATE_MESSAGE'), {
          message: '',
          name: `Error\n${INJECTED_FRAME}`
        }),
      'Error'
    ],
    [
      'a name embedding the message',
      () =>
        Object.assign(new Error('PRIVATE_MESSAGE'), {
          name: `X: PRIVATE_MESSAGE\n${INJECTED_FRAME}\nY`
        }),
      'Error'
    ],
    [
      'a DOMException name',
      () => new DOMException('', `Error\n${INJECTED_FRAME}`),
      'DOMException'
    ],
    [
      'an internal Node error code',
      () =>
        Object.assign(textDecoderError(), {
          code: `X]\n${INJECTED_FRAME}\nY`,
          message: ''
        }),
      'RangeError'
    ]
  ])('drops frames with %s', (_label, create, type) => {
    const error = formattedByNode(create)
    // Positive control: the injected line follows the name in the stack.
    expect(error.stack).toContain(`\n${INJECTED_FRAME}\n`)

    logServerFailure({ source: 'middleware', error })

    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${MESSAGE}\n${type}`)
  })

  it('logs only frames when the class has no valid name', () => {
    const Anonymous = anonymousErrorClass()
    // Positive control: the constructor has no name.
    expect(Anonymous.name).toBe('')

    logServerFailure({
      source: 'middleware',
      error: new Anonymous('PRIVATE_MESSAGE')
    })

    const [first, frame] = loggedLines()
    expect(first).toBe(MESSAGE)
    expect(frame).toMatch(LOCAL_FRAME)
    expect(loggedText()).not.toContain('PRIVATE')
  })
})

describe('stack inspection limits', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(vi.fn()))

  it('logs at most 10 frames', () => {
    const frames = Array.from(
      { length: SYNTHETIC_FRAMES },
      (_, index) => `    at step${index} (file:///app/server.js:${index + 1}:1)`
    )

    logServerFailure({ source: 'middleware', error: withStack(frames) })

    expect(loggedLines()).toStrictEqual([
      MESSAGE,
      'Error',
      ...frames.slice(0, FRAME_LIMIT)
    ])
  })

  it('drops lines outside the frame grammar without stopping inspection', () => {
    // Each pair contains a rejected line and an accepted frame.
    const pairs = [
      [
        '    at async Promise.all (index 0)',
        '    at handler (file:///app/server.js:1:2)'
      ],
      [
        '    at eval (eval at <anonymous> (file:///app/x.js:1:1), <anonymous>:1:1)',
        '    at async load (node:internal/modules/esm/loader:3:4)'
      ],
      [
        '    at https://PRIVATE.example/x.js:1:1',
        '    at new Store (/app/store.js:5:6)'
      ],
      [
        '    at handler (http://PRIVATE.example/x.js:1:1)',
        '    at Object.<anonymous> [as run] (/app/run.js:7:8)'
      ],
      ['    at /PRIVATE dir/x.js:1:1', '    at /app/server.js:9:10'],
      [
        '    at handler (file:///PRIVATE.js:1:1',
        '    at async file:///app/server.js:11:12'
      ],
      ['PRIVATE_LINE', '    at Array.[Symbol.iterator] (node:x:13:14)'],
      [
        '    at handler (file:///app/x.js:1:1) PRIVATE',
        '    at run (file:///app/run.js?v=1:15:16)'
      ],
      ['    at /app/x.js:1:1 PRIVATE', '    at node:internal/x:17:18']
    ] as const

    logServerFailure({ source: 'middleware', error: withStack(pairs.flat()) })

    expect(loggedLines()).toStrictEqual([
      MESSAGE,
      'Error',
      ...pairs.map(([, frame]) => frame)
    ])
  })

  // Real file:// frames encode these characters; raw characters could change
  // terminal state or the log display.
  it.each([
    [
      'the ESC of a terminal sequence',
      '    at handler (/PRIVATE\u001B[2J:1:1)'
    ],
    ['U+202E, which reverses text direction', '    at /PRIVATE‮gnp.js:1:1']
  ])('drops a frame with %s in its location', (_label, line) => {
    logServerFailure({
      source: 'middleware',
      error: withStack([line, PLAIN_FRAME])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', PLAIN_FRAME])
  })

  // Parentheses would prematurely close a function location, so route-group
  // paths must be excluded.
  it.each([
    [
      'in a route group folder',
      '    at GET (/app/src/routes/(seo)/sitemap.xml/index.ts:1:1)'
    ],
    ['without a function', '    at /a(b):1:1'],
    [
      'in file:// with a route group',
      '    at file:///app/src/routes/(seo)/x.ts:1:1'
    ]
  ])('drops a frame with parentheses in its location %s', (_label, line) => {
    logServerFailure({
      source: 'middleware',
      error: withStack([line, PLAIN_FRAME])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', PLAIN_FRAME])
  })

  // V8 omits the colon for an empty message; the Vite formatter keeps it,
  // so its header leaves no frames.
  it.each([
    ['reads', 'Error', [PLAIN_FRAME]],
    ['drops', 'Error: ', []]
  ])(
    '%s frames of an empty message under header %j',
    (_label, header, frames) => {
      const error = Object.assign(new Error('PRIVATE_MESSAGE'), {
        message: '',
        stack: [header, PLAIN_FRAME].join('\n')
      })

      logServerFailure({ source: 'middleware', error })

      expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', ...frames])
    }
  )

  it.each([
    ['accepts', LINE_LIMIT, [frameOfLength(LINE_LIMIT)]],
    ['drops', LINE_LIMIT + 1, []]
  ])('%s a line of %i characters', (_label, length, frames) => {
    logServerFailure({
      source: 'middleware',
      error: withStack([frameOfLength(length)])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', ...frames])
  })

  it.each([
    ['reads', READ_LIMIT - 1, [LATE_FRAME]],
    ['does not read', READ_LIMIT, []]
  ])('%s a frame after %i discarded lines', (_label, count, frames) => {
    const filler = Array.from({ length: count }, () => 'PRIVATE_FILLER')

    logServerFailure({
      source: 'middleware',
      error: withStack([...filler, LATE_FRAME])
    })

    expect(loggedLines()).toStrictEqual([MESSAGE, 'Error', ...frames])
  })
})
