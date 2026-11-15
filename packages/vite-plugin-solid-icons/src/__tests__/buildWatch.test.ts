import assert from 'node:assert/strict'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { once } from 'node:events'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env, execPath } from 'node:process'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { createFixtureApp, defer, TYPES_FILE } from './fixture-app.ts'

type BuildOutput = { stdout: string; stderr: string }
type BundleText = { root: string; text: string }
type BuildChild = {
  child: ChildProcessWithoutNullStreams
  closed: Promise<unknown>
}
type BuildWait = {
  child: ChildProcessWithoutNullStreams
  output: BuildOutput
  step: string
  // What the build has to do, for the message of a timeout.
  goal: string
  // The builds that ended before the step, counted before its edit.
  after: number
  isDone: () => Promise<boolean>
}

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
// Generous, so a loaded runner finishes; a failure names the step.
const BUILD_TIMEOUT = 60_000
const CLOSE_TIMEOUT = 30_000
// The log line of Vite that ends each build of a watched build.
const BUILT = /built in \d+ms/gu
const NODE_WARNING = /^\(node:\d+\) |^\(Use `node --trace-/u
const SUN_PATH = 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'
const SUN_SVG = `<svg viewBox="0 0 24 24"><path d="${SUN_PATH}"/></svg>`
const FIXTURE = pathToFileURL(path.join(import.meta.dirname, 'fixture-app.ts'))
// A watched build as the CLI starts it, with no listener of its own, that
// stops when its input closes. WHY: the native watcher of the build missed
// changes in two of three runs on a loaded machine; polling sees each one.
const WATCHED_BUILD = `
import { build } from 'vite-plus'
import { fixtureConfig } from ${JSON.stringify(FIXTURE.href)}
const watcher = await build({
  ...fixtureConfig({ root: process.argv[1], isSsr: false }),
  logLevel: 'info',
  clearScreen: false,
  build: {
    watch: { chokidar: { usePolling: true, interval: 50 } },
    outDir: 'dist',
    minify: false,
    rolldownOptions: { input: 'entry.js' }
  }
})
process.stdin.on('end', () => watcher.close())
process.stdin.resume()
`

// Whether the JavaScript that the last build wrote has the text.
async function hasBundleText({ root, text }: BundleText): Promise<boolean> {
  const dist = path.join(root, 'dist')
  const files = await readdir(dist, { recursive: true })
  const scripts = files.filter(file => file.endsWith('.js'))
  const contents = await Promise.all(
    scripts.map(file => readFile(path.join(dist, file), 'utf8'))
  )
  return contents.some(content => content.includes(text))
}

// The output of the build without the warnings of Node itself, so only an
// error of the build stops the wait.
function buildErrors(output: BuildOutput): string {
  return output.stderr
    .split('\n')
    .filter(line => !NODE_WARNING.test(line))
    .join('\n')
    .trim()
}

function builds(output: BuildOutput): number {
  return output.stdout.match(BUILT)?.length ?? 0
}

// Waits for the end of each build after the edit of the step until the
// check holds, also a build that ended before the wait. A build that fails
// writes its error, which stops the wait with it.
async function waitForBuild({
  child,
  output,
  step,
  goal,
  after,
  isDone
}: BuildWait): Promise<void> {
  const deadline = Date.now() + BUILD_TIMEOUT
  let seen = after
  for (;;) {
    const errors = buildErrors(output)
    if (errors !== '') {
      throw new Error(`The watched build failed ${step}:\n${errors}`)
    }
    if (builds(output) > seen) {
      seen = builds(output)
      if (await isDone()) return
    }
    const left = deadline - Date.now()
    if (left <= 0) {
      throw new Error(
        `The watched build did not end a build that ${goal} in ${BUILD_TIMEOUT} ms ${step}:\n${output.stdout}`
      )
    }
    const signal = AbortSignal.timeout(left)
    try {
      await Promise.race([
        once(child.stdout, 'data', { signal }),
        once(child.stderr, 'data', { signal })
      ])
    } catch {
      // The deadline is checked again before the next wait.
    }
  }
}

async function stop({ child, closed }: BuildChild): Promise<void> {
  child.stdin.end()
  const timeout = setTimeout(() => child.kill('SIGKILL'), CLOSE_TIMEOUT)
  await closed
  clearTimeout(timeout)
  assert.equal(
    child.signalCode,
    null,
    `The watched build did not close in ${CLOSE_TIMEOUT} ms after its input closed.`
  )
}

test('a watched build reads a new SVG of a folder', async context => {
  const root = await createFixtureApp()
  defer({ context, task: () => rm(root, { recursive: true, force: true }) })
  const entry = path.join(root, 'entry.js')
  await writeFile(entry, "import { Star } from 'icon:own'\nconsole.log(Star)\n")
  const child = spawn(
    execPath,
    ['--input-type=module', '-e', WATCHED_BUILD, root],
    {
      cwd: PACKAGE_ROOT,
      env: { ...env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    }
  )
  const closed = once(child, 'close')
  const output: BuildOutput = { stdout: '', stderr: '' }
  child.stdout.on('data', (chunk: Buffer) => {
    output.stdout += chunk.toString()
  })
  child.stderr.on('data', (chunk: Buffer) => {
    output.stderr += chunk.toString()
  })
  defer({ context, task: () => stop({ child, closed }) })
  const types = path.join(root, TYPES_FILE)
  await waitForBuild({
    child,
    output,
    step: 'at the start',
    goal: 'bundles the star',
    after: 0,
    isDone: () => hasBundleText({ root, text: 'M12 2l3 7h7' })
  })

  // The SVG first and the import after the build it starts, as an editor
  // saves them; a build that read the import first would fail on it.
  const beforeSvg = builds(output)
  await writeFile(path.join(root, 'icons/sun.svg'), SUN_SVG)
  await waitForBuild({
    child,
    output,
    step: 'after a new SVG',
    goal: 'declares Sun',
    after: beforeSvg,
    isDone: async () => {
      const declarations = await readFile(types, 'utf8')
      return declarations.includes('export const Sun: IconComponent')
    }
  })
  const beforeImport = builds(output)
  await writeFile(entry, "import { Sun } from 'icon:own'\nconsole.log(Sun)\n")
  await waitForBuild({
    child,
    output,
    step: 'after an import of the new SVG',
    goal: 'bundles the sun',
    after: beforeImport,
    isDone: () => hasBundleText({ root, text: SUN_PATH })
  })

  assert.equal(buildErrors(output), '')
})
