import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execPath, getuid } from 'node:process'
import { describe, it, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

import { build, createLogger, createServer, type Logger } from 'vite-plus'

import { writeTypesFile } from '../iconTypes/index.ts'
import { checkIconTypes, writeIconTypes } from '../index.ts'
import {
  createFixtureApp,
  defer,
  fixtureConfig,
  TYPES_FILE
} from './fixture-app.ts'

type ChildRun = { code: string; args: string[]; timeout: number }
type ChildResult = { exitCode: number | null; stdout: string; ms: number }
type FolderInput = { context: TestContext; name: string }
type TextSearch = { list: string[]; text: string }
type EntryBuild = {
  root: string
  code: string
  logger?: Logger
  collections?: Record<string, string>
}

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const WAIT_TIMEOUT = 30_000
const POLL_INTERVAL = 100
const IS_ROOT_USER = getuid?.() === 0
const READ_ONLY = 0o555
const WRITABLE = 0o755
const NO_ACCESS = 0o000
const READER_START = 300
const WRITES = 60
// A reader in another process that reports every read that is neither of
// the two contents the test writes.
const READER = `
import { existsSync, readFileSync } from 'node:fs'
const [file, stop, size] = process.argv.slice(1)
const first = 'A'.repeat(Number(size)) + '\\n'
const second = 'B'.repeat(Number(size)) + '\\n'
let reads = 0, partial = 0, missing = 0
while (!existsSync(stop)) {
  try {
    const text = readFileSync(file, 'utf8')
    reads += 1
    if (text !== first && text !== second) partial += 1
  } catch {
    missing += 1
  }
}
console.log(JSON.stringify({ reads, partial, missing }))
`

async function runChild({
  code,
  args,
  timeout
}: ChildRun): Promise<ChildResult> {
  const started = performance.now()
  const child = spawn(execPath, ['--input-type=module', '-e', code, ...args], {
    cwd: PACKAGE_ROOT,
    stdio: ['ignore', 'pipe', 'inherit']
  })
  let stdout = ''
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })
  try {
    await once(child, 'exit', { signal: AbortSignal.timeout(timeout) })
    return { exitCode: child.exitCode, stdout, ms: performance.now() - started }
  } catch (error) {
    child.kill()
    throw error
  }
}

function hasText({ list, text }: TextSearch): boolean {
  return list.some(message => message.includes(text))
}

function warnings(list: string[]): Logger {
  return {
    ...createLogger('silent'),
    warn: message => {
      list.push(message)
    }
  }
}

async function tempFolder({ context, name }: FolderInput): Promise<string> {
  const created = await mkdtemp(path.join(tmpdir(), name))
  const folder = await realpath(created)
  defer({ context, task: () => rm(folder, { recursive: true, force: true }) })
  return folder
}

async function app(context: TestContext): Promise<string> {
  const root = await createFixtureApp()
  defer({ context, task: () => rm(root, { recursive: true, force: true }) })
  return root
}

async function buildEntry({ root, code, logger, collections }: EntryBuild) {
  const entry = path.join(root, 'entry.js')
  await writeFile(entry, code)
  const config = fixtureConfig({ root, isSsr: false })
  const [icons, ...plugins] = config.plugins ?? []
  const { solidIcons } = await import('../index.ts')
  await build({
    ...config,
    ...(logger ? { customLogger: logger } : {}),
    plugins: collections
      ? [solidIcons({ collections }), ...plugins]
      : [icons, ...plugins],
    build: { write: false, rolldownOptions: { input: entry } }
  })
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT
  while (!check()) {
    if (Date.now() > deadline) throw new Error('The condition did not hold.')
    await delay(POLL_INTERVAL)
  }
}

describe('the declarations file', () => {
  it('is replaced in one step for a reader in another process', async context => {
    const folder = await tempFolder({ context, name: 'solid-icons-atomic-' })
    const file = path.join(folder, 'icon-collections.d.ts')
    const stop = path.join(folder, 'stop')
    const size = 1_000_000
    const contents = ['A', 'B'].map(letter => `${letter.repeat(size)}\n`)
    await writeTypesFile({ file, content: contents[0] ?? '' })
    const reader = runChild({
      code: READER,
      args: [file, stop, String(size)],
      timeout: 60_000
    })
    // The reader starts reading before the writes.
    await delay(READER_START)
    for (let write = 0; write < WRITES; write += 1) {
      const content = contents[write % contents.length] ?? ''
      await writeTypesFile({ file, content })
    }
    await writeFile(stop, '')
    const { stdout } = await reader
    const report: unknown = JSON.parse(stdout)

    assert.ok(typeof report === 'object' && report !== null)
    assert.ok('reads' in report && Number(report.reads) > 0)
    assert.deepEqual(
      {
        partial: 'partial' in report && report.partial,
        missing: 'missing' in report && report.missing
      },
      { partial: 0, missing: 0 }
    )
    const left = await readdir(folder)
    assert.deepEqual(left.toSorted(), ['icon-collections.d.ts', 'stop'])
  })

  it('stays whole when two builds and a dev server write it', async context => {
    const root = await app(context)
    const config = fixtureConfig({ root, isSsr: false })
    const buildOnce = () =>
      build({ ...config, logLevel: 'silent', build: { write: false } })
    const starting = createServer({
      ...config,
      // The optimizer of the dev server keeps its own folder, away from the
      // builds.
      cacheDir: '.vite-dev',
      server: { watch: null, middlewareMode: true }
    })
    defer({
      context,
      task: async () => {
        const server = await starting
        await server.close()
      }
    })
    await Promise.all([starting, buildOnce(), buildOnce()])

    await checkIconTypes({ root, collections: { own: './icons' } })
    const src = await readdir(path.join(root, 'src'))
    assert.deepEqual(
      src.filter(file => file.endsWith('.tmp')),
      []
    )
  })

  it('is left as it is when it cannot be written', async context => {
    if (IS_ROOT_USER) {
      context.skip('the root user writes in a read-only folder')
      return
    }
    const root = await app(context)
    const types = path.join(root, 'src')
    const list: string[] = []
    await chmod(types, READ_ONLY)
    try {
      await buildEntry({
        root,
        code: "import { Star } from 'icon:own'\nconsole.log(Star)\n",
        logger: warnings(list)
      })
    } finally {
      await chmod(types, WRITABLE)
    }

    assert.equal(list.length, 1)
    assert.match(
      list[0] ?? '',
      /\[plugin vite-plugin-solid-icons\] The icon declarations cannot be written to .*icon-collections\.d\.ts \(EACCES\)\./u
    )
  })
})

describe('a folder of icons', () => {
  it('that does not exist stops only the imports of its icons', async context => {
    const root = await app(context)
    const list: string[] = []
    const collections = { own: './icons', brand: './no-such-folder' }

    await buildEntry({
      root,
      code: "import { Star } from 'icon:own'\nconsole.log(Star)\n",
      logger: warnings(list),
      collections
    })
    assert.match(
      list.join('\n'),
      /The folder "no-such-folder" of the icon collection "brand" cannot be read \(ENOENT\)\./u
    )
    await assert.rejects(
      buildEntry({
        root,
        code: "import Logo from 'icon:brand/logo'\nconsole.log(Logo)\n",
        logger: warnings([]),
        collections
      }),
      /The folder "no-such-folder" of the icon collection "brand" cannot be read \(ENOENT\)\./u
    )
  })

  it('that cannot be read names the error', async context => {
    if (IS_ROOT_USER) {
      context.skip('the root user reads a folder without permissions')
      return
    }
    const root = await app(context)
    const icons = path.join(root, 'icons')
    await chmod(icons, NO_ACCESS)
    try {
      await assert.rejects(
        buildEntry({
          root,
          code: "import Star from 'icon:own/star'\nconsole.log(Star)\n",
          logger: warnings([])
        }),
        /The folder "icons" of the icon collection "own" cannot be read \(EACCES\)\./u
      )
    } finally {
      await chmod(icons, WRITABLE)
    }
  })

  it('that goes away keeps the dev server running', async context => {
    const root = await app(context)
    const list: string[] = []
    const server = await createServer({
      ...fixtureConfig({ root, isSsr: false }),
      customLogger: warnings(list),
      server: {
        middlewareMode: true,
        watch: { usePolling: true, interval: POLL_INTERVAL }
      }
    })
    defer({ context, task: () => server.close() })
    const { client } = server.environments
    await client.transformRequest('icon:own/star')

    await rm(path.join(root, 'icons'), { recursive: true })
    await waitFor(() => hasText({ list, text: '(ENOENT)' }))
    await assert.rejects(
      client.transformRequest('icon:own/moon'),
      /The folder "icons" of the icon collection "own" cannot be read \(ENOENT\)\./u
    )
    const github = await client.transformRequest('icon:hugeicons/github')
    assert.match(github?.code ?? '', /svg/u)
  })

  it('lives in a path with spaces and accents', async context => {
    const parent = await tempFolder({ context, name: 'solid-icons-path-' })
    const root = path.join(parent, 'pasta com espaço', 'ícones')
    await mkdir(path.dirname(root), { recursive: true })
    await rename(await app(context), root)
    await rename(path.join(root, 'icons'), path.join(root, 'meus ícones'))

    await buildEntry({
      root,
      code: "import { Star } from 'icon:own'\nimport Moon from 'icon:own/moon'\nconsole.log(Star, Moon)\n",
      collections: { own: './meus ícones' }
    })
    const types = await readFile(path.join(root, TYPES_FILE), 'utf8')
    assert.match(types, /export const Star: IconComponent/u)
  })
})

describe('the package.json of the application', () => {
  // Vite refuses the package.json of its root before the plugin runs; the
  // functions for the CI read it on their own.
  it('that is not valid JSON names the file', async context => {
    const root = await app(context)
    await writeFile(path.join(root, 'package.json'), '{ "devDependencies": ')
    const message =
      /The package\.json in ".*" is not valid JSON, so the icon collections it installs are unknown/u

    await assert.rejects(
      writeIconTypes({ root, collections: { own: './icons' } }),
      message
    )
    await assert.rejects(
      checkIconTypes({ root, collections: { own: './icons' } }),
      message
    )
  })

  it('that is missing declares the folder collections only', async context => {
    const root = await tempFolder({ context, name: 'solid-icons-bare-' })
    await mkdir(path.join(root, 'icons'))
    await writeFile(path.join(root, 'icons/star.svg'), '<svg><path/></svg>')
    await symlink(
      path.join(PACKAGE_ROOT, 'node_modules'),
      path.join(root, 'node_modules')
    )
    const { file } = await writeIconTypes({
      root,
      collections: { own: './icons' }
    })
    const types = await readFile(file, 'utf8')

    assert.match(types, /declare module 'icon:own'/u)
    assert.doesNotMatch(types, /declare module 'icon:hugeicons'/u)
  })
})

describe('a dev server', () => {
  it('closes without leaving the process running', async () => {
    const root = await createFixtureApp()
    try {
      const fixture = pathToFileURL(
        path.join(import.meta.dirname, 'fixture-app.ts')
      ).href
      const { exitCode, stdout } = await runChild({
        code: `
import { createServer } from 'vite-plus'
import { fixtureConfig } from ${JSON.stringify(fixture)}
const server = await createServer({
  ...fixtureConfig({ root: process.argv[1], isSsr: false }),
  server: { port: 0, strictPort: false, watch: { usePolling: true, interval: 100 } }
})
await server.listen()
await server.environments.client.transformRequest('icon:own/star')
await server.close()
console.log('closed')
`,
        args: [root],
        timeout: 60_000
      })

      assert.equal(exitCode, 0)
      assert.equal(stdout.trim(), 'closed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
