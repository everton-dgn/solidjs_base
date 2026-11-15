import assert from 'node:assert/strict'
import fs from 'node:fs'
import { open, rm, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import { describe, it, mock, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { build, createServer, type Plugin } from 'vite-plus'

import { solidIcons } from '../index.ts'
import {
  createFixtureApp,
  defer,
  fixtureConfig,
  TYPES_FILE
} from './fixture-app.ts'

type HookName = 'resolveId' | 'load' | 'transform'
type Handler = (...args: unknown[]) => unknown
type HookCalls = Record<HookName, number>
type ReadCount = {
  context: TestContext
  method: 'readFile' | 'readdir'
  ending: string
}

const PLAIN_MODULES = 40
const WAIT_TIMEOUT = 30_000
const POLL_INTERVAL = 100
const QUIET_TIME = 1000
const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'

function pathOf(file: unknown): string {
  if (typeof file === 'string') return file
  return file instanceof URL ? file.pathname : ''
}

function isPlugin(value: unknown): value is Plugin {
  return typeof value === 'object' && value !== null && 'name' in value
}

function isHandler(value: unknown): value is Handler {
  return typeof value === 'function'
}

// Counts the calls that reach the handlers of the plugin, after the filters.
function countHooks(plugin: Plugin): HookCalls {
  const calls: HookCalls = { resolveId: 0, load: 0, transform: 0 }
  for (const name of ['resolveId', 'load', 'transform'] as const) {
    const hook: unknown = plugin[name]
    if (typeof hook !== 'object' || hook === null || !('handler' in hook)) {
      throw new Error(`The ${name} hook has no filter.`)
    }
    const { handler } = hook
    if (!isHandler(handler)) throw new Error(`The ${name} hook has no handler.`)
    Object.assign(hook, {
      handler(this: unknown, ...args: unknown[]) {
        calls[name] += 1
        return Reflect.apply(handler, this, args)
      }
    })
  }
  return calls
}

// Counts the reads of the files whose path ends as given, through the
// functions of node:fs/promises that the plugin and @iconify/utils call.
function countReads({ context, method, ending }: ReadCount) {
  const spy = mock.method(fs.promises, method)
  syncBuiltinESMExports()
  context.after(() => {
    spy.mock.restore()
    syncBuiltinESMExports()
  })
  return () =>
    spy.mock.calls.filter(({ arguments: [file] }) =>
      pathOf(file).endsWith(ending)
    ).length
}

async function app(context: TestContext): Promise<string> {
  const root = await createFixtureApp()
  defer({ context, task: () => rm(root, { recursive: true, force: true }) })
  return root
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('The condition did not hold.')
    await delay(POLL_INTERVAL)
  }
}

describe('the plugin', () => {
  it('runs its hooks only for the modules of icons', async context => {
    const root = await app(context)
    const plain = Array.from({ length: PLAIN_MODULES }, (_, index) => index)
    for (const index of plain) {
      await writeFile(
        path.join(root, `src/plain-${index}.ts`),
        `export const value${index} = ${index}\n`
      )
    }
    // Escapes that spell no letter of an import, as a module of text has.
    await writeFile(
      path.join(root, 'src/escapes.ts'),
      `${String.raw`export const text = ['\n', "\t", '\\', '\x1b[0m', '\u2014'].join('')`}\n`
    )
    await writeFile(
      path.join(root, 'entry.js'),
      `${plain.map(index => `import { value${index} } from './src/plain-${index}.ts'`).join('\n')}
import { text } from './src/escapes.ts'
import { Star } from 'icon:own'
import Moon from 'icon:own/moon'
console.log(Star, Moon, text, ${plain.map(index => `value${index}`).join(', ')})
`
    )
    const config = fixtureConfig({ root, isSsr: false, typesFile: false })
    const [icons, ...plugins] = config.plugins ?? []
    assert.ok(isPlugin(icons))
    const plugin = icons
    const calls = countHooks(plugin)
    await build({
      ...config,
      logLevel: 'silent',
      plugins: [plugin, ...plugins],
      build: {
        write: false,
        rolldownOptions: { input: path.join(root, 'entry.js') }
      }
    })

    // The transform parses entry.js only: the filter on the code keeps the
    // other 41 modules and the icons away from the parser.
    assert.deepEqual(calls, { resolveId: 2, load: 2, transform: 1 })
  })

  it('reads icons.json once for a root', async context => {
    const root = await app(context)
    const reads = countReads({
      context,
      method: 'readFile',
      ending: '@iconify-json/hugeicons/icons.json'
    })
    const server = await createServer({
      ...fixtureConfig({ root, isSsr: false, typesFile: false }),
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true, watch: null }
    })
    defer({ context, task: () => server.close() })
    const names = ['github', 'arrow-left-01', '3d-move', 'home-01', 'user']
    await Promise.all(
      names.map(name =>
        server.environments.client.transformRequest(`icon:hugeicons/${name}`)
      )
    )
    await build({
      ...fixtureConfig({ root, isSsr: false }),
      logLevel: 'silent',
      build: { write: false }
    })

    assert.equal(reads(), 1)
  })

  it('reads the folder and writes the declarations once in a dev session', async context => {
    const root = await app(context)
    const reads = countReads({
      context,
      method: 'readdir',
      ending: `${path.sep}icons`
    })
    // writeTypesFile reads the file before each render.
    const renders = countReads({
      context,
      method: 'readFile',
      ending: TYPES_FILE
    })
    const server = await createServer({
      ...fixtureConfig({ root, isSsr: true }),
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true, watch: null }
    })
    defer({ context, task: () => server.close() })
    const { client, ssr } = server.environments
    for (const environment of [client, ssr]) {
      for (const name of ['star', 'moon', 'logo.v2', 'star?raw']) {
        await environment.transformRequest(`icon:own/${name}`)
      }
      await environment.transformRequest('/src/NamedIcons.tsx')
    }

    assert.equal(reads(), 1)
    assert.equal(renders(), 1)
  })

  it('writes the declarations once for a new SVG file', async context => {
    const root = await app(context)
    const typesFile = path.join(root, TYPES_FILE)
    const reads = countReads({
      context,
      method: 'readFile',
      ending: TYPES_FILE
    })
    const server = await createServer({
      ...fixtureConfig({ root, isSsr: true }),
      plugins: [
        solidIcons({ collections: { own: './icons' } }),
        ...(fixtureConfig({ root, isSsr: true }).plugins ?? []).slice(1)
      ],
      optimizeDeps: { noDiscovery: true },
      // The test reports each new file, as the file watcher would.
      server: { middlewareMode: true, watch: null }
    })
    defer({ context, task: () => server.close() })
    assert.deepEqual(Object.keys(server.environments).toSorted(), [
      'client',
      'ssr'
    ])
    // A file handle reads past the spy, which counts the reads of the
    // plugin only.
    const declares = (name: string) => async () => {
      const handle = await open(typesFile)
      try {
        const types = await handle.readFile('utf8')
        return types.includes(`export const ${name}:`)
      } finally {
        await handle.close()
      }
    }
    await waitFor(declares('Star'))
    await delay(QUIET_TIME)
    const before = reads()

    await writeFile(path.join(root, 'icons/sun.svg'), SVG)
    server.watcher.emit('add', path.join(root, 'icons/sun.svg'))
    await waitFor(declares('Sun'))
    await delay(QUIET_TIME)
    const single = reads() - before

    const burst = Array.from({ length: 10 }, (_, index) => `burst-${index}`)
    const burstFiles = burst.map(name => path.join(root, `icons/${name}.svg`))
    await Promise.all(burstFiles.map(file => writeFile(file, SVG)))
    for (const file of burstFiles) server.watcher.emit('add', file)
    await waitFor(declares('Burst9'))
    await delay(QUIET_TIME)
    const burstReads = reads() - before - single

    // Both environments receive the event; one render answers it.
    assert.equal(single, 1)
    // The renders asked while one waits share it.
    assert.ok(
      burstReads < burst.length,
      `${burstReads} renders for ${burst.length} new files`
    )
  })
})
