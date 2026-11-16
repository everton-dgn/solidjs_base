import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { platform } from 'node:process'
import { mock, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { createServer, type FSWatcher } from 'vite-plus'

import { generateMessages } from '../../generateMessages/index.ts'
import { writeProject } from '../../testProject/index.ts'
import { i18nPlugin } from '../index.ts'

type Close = () => Promise<unknown>
type StartOptions = {
  context: TestContext
  root?: string
  onClosing?: () => void
  shouldIgnoreCompilerInputs?: boolean
}
type DevServer = {
  root: string
  payloads: () => unknown[]
  status: () => Promise<number>
  body: () => Promise<string>
  change: (file: string) => void
  close: () => Promise<void>
}
type ProjectWrite = {
  file: string
  update: (content: string) => string
  output: string
  expected: RegExp
}
type ContainsOptions = { root: string; file: string; expected: RegExp }

const RUNTIME_FILE = 'paraglide/runtime.js'
const TIMEOUT_MS = 20_000
// On macOS, fs.watch delivers directory events through fseventsd, which falls
// tens of seconds behind on a loaded machine, and libuv drops pending events
// each time it rebuilds its stream for a new directory. Polling reads stats.
const SHOULD_POLL = platform === 'darwin'
// Below the 100 ms catalog debounce, so both parts of a save land inside it.
const WATCH_INTERVAL_MS = 50
// The shutdown test emits compiler input events by hand; a watcher event on
// these files would start the compilation that the test holds.
const COMPILER_INPUTS = ['**/project.inlang/**', '**/.paraglide/**']

function payloadType(payload: unknown): unknown {
  return typeof payload === 'object' && payload !== null && 'type' in payload
    ? payload.type
    : undefined
}

// Resolve with the error: createServer can fail after the waiting hook,
// which must not leave an unhandled rejection.
async function scanResult(watcher: FSWatcher): Promise<unknown> {
  try {
    await once(watcher, 'ready', { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return null
  } catch (error) {
    return error
  }
}

export const MESSAGES = { home_title: 'Title', home_body: 'Body' }
export const POLL_MS = 50
export const PROJECT_WRITES: ProjectWrite[] = [
  {
    file: 'project.inlang/settings.json',
    update: content =>
      content.replace('"baseLocale":"de"', '"baseLocale":"fr"'),
    output: RUNTIME_FILE,
    expected: /baseLocale = "fr";/u
  },
  {
    file: 'src/routes/Home/i18n/it.json',
    update: () => JSON.stringify({ ...MESSAGES, home_body: 'Nuevo' }),
    output: 'paraglide/messages/home_body.js',
    expected: /Nuevo/u
  }
]

export function readRuntime(root: string): Promise<string> {
  return readFile(path.join(root, RUNTIME_FILE), 'utf8')
}

export async function contains({
  root,
  file,
  expected
}: ContainsOptions): Promise<boolean> {
  try {
    return expected.test(await readFile(path.join(root, file), 'utf8'))
  } catch {
    return false
  }
}

export async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the watcher')
    }
    await delay(POLL_MS)
  }
}

// A real Vite watcher and official plugin in an owned temporary root.
// Close HTTP and Vite before cleanup so the watcher cannot react to removal.
export async function startServer({
  context,
  root: existing,
  onClosing,
  shouldIgnoreCompilerInputs = false
}: StartOptions): Promise<DevServer> {
  const root = existing ?? (await mkdtemp(path.join(tmpdir(), 'i18n-plugin-')))
  const closers: Close[] = []
  let scan: Promise<unknown> | undefined
  context.after(async () => {
    for (const close of closers.toReversed()) await close()
    if (!existing) await rm(root, { recursive: true, force: true })
  })
  if (!existing) {
    await writeProject({ root, messages: MESSAGES })
    // Initialize SDK metadata before observing user edits.
    // Restarts reuse previous output to test actual recovery.
    await generateMessages(root)
  }
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    // Vite passes missing .env and public paths to Chokidar, whose Vite+ build
    // counts their ready events twice. Disable them so ready does not precede
    // the remaining directory scans and lose the first write.
    envDir: false,
    publicDir: false,
    // fs.watch is the Chokidar backend on Linux CI; macOS polls (SHOULD_POLL).
    server: {
      middlewareMode: true,
      watch: {
        useFsEvents: false,
        usePolling: SHOULD_POLL,
        interval: WATCH_INTERVAL_MS,
        ...(shouldIgnoreCompilerInputs ? { ignored: COMPILER_INPUTS } : {})
      }
    },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      i18nPlugin(),
      {
        name: 'test:lifecycle-observer',
        // Chokidar ready may precede createServer resolution. Before the first
        // configureServer, Vite+ only runs microtasks and scanning needs I/O.
        // If that ordering changes, the wait reaches TIMEOUT_MS.
        configureServer: {
          order: 'pre',
          handler: devServer => {
            scan = scanResult(devServer.watcher)
          }
        },
        closeBundle: onClosing
      }
    ]
  })
  closers.push(() => server.close())
  const send = mock.method(server.ws, 'send')
  const http = createHttpServer(server.middlewares).listen(0, '127.0.0.1')
  closers.push(async () => {
    http.close()
    await once(http, 'close')
  })
  await once(http, 'listening')
  // Wait for the initial scan before editing files.
  const scanError = await scan
  if (scanError !== null) {
    throw new Error('The watcher did not finish the initial scan', {
      cause: scanError
    })
  }
  const address = http.address()
  if (typeof address !== 'object' || address === null) {
    throw new Error('Missing test server address')
  }
  const url = `http://127.0.0.1:${address.port}/`
  return {
    root,
    change: file => {
      server.watcher.emit('change', path.join(server.config.root, file))
    },
    close: () => server.close(),
    payloads: () => send.mock.calls.map(call => payloadType(call.arguments[0])),
    status: async () => {
      const response = await fetch(url)
      await response.body?.cancel()
      return response.status
    },
    body: async () => {
      const response = await fetch(url)
      return response.text()
    }
  }
}
