import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execPath } from 'node:process'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import {
  CSP_DIRECTIVES,
  SECURITY_HEADERS
} from '../../../src/middleware/securityHeaders/constants.js'

type Command = { file: string; args: string[]; cwd: string }
type Installation = { entries: string[]; packageFolder: string; app: string }
type InstallOptions = { tarball: string; app: string }

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..')
const VP = path.join(PACKAGE_ROOT, 'node_modules/.bin/vp')
const PACKAGE_NAME = '@evertondgn/solid-runtime'
const CONSTANTS_SPECIFIER = `${PACKAGE_NAME}/middleware/security-headers/constants`
const COMMAND_TIMEOUT = 60_000

const execFileAsync = promisify(execFile)

async function run({ file, args, cwd }: Command): Promise<string> {
  const { stdout } = await execFileAsync(file, args, {
    cwd,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT
  })
  return stdout
}

// The real path, because Node reports the modules it loads by real path and
// the temporary folder of macOS is a symbolic link.
async function temporaryFolder(prefix: string): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), prefix))
  return realpath(folder)
}

async function pack(destination: string): Promise<string> {
  await run({
    file: VP,
    args: ['pm', 'pack', '--pack-destination', destination],
    cwd: PACKAGE_ROOT
  })
  const files = await readdir(destination)
  const tarball = files.find(name => name.endsWith('.tgz'))
  assert.ok(tarball, 'vp pm pack did not produce the tarball.')
  return path.join(destination, tarball)
}

// The layout of an installation, without the network and without the peers:
// the tarball extracted to node_modules of another folder.
async function install({
  tarball,
  app
}: InstallOptions): Promise<Installation> {
  const packageFolder = path.join(app, 'node_modules', PACKAGE_NAME)
  await mkdir(packageFolder, { recursive: true })
  await run({
    file: 'tar',
    args: ['-xzf', tarball, '-C', packageFolder, '--strip-components=1'],
    cwd: app
  })
  const listing = await run({ file: 'tar', args: ['-tzf', tarball], cwd: app })
  const entries = listing.split('\n').filter(entry => entry !== '')
  return { entries, packageFolder, app }
}

function exportTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object' || value === null) return []
  return Object.values(value).flatMap(entry => exportTargets(entry))
}

async function assertConstantsLoad({
  app,
  packageFolder
}: Installation): Promise<void> {
  const script = [
    `const specifier = ${JSON.stringify(CONSTANTS_SPECIFIER)}`,
    'const { SECURITY_HEADERS, CSP_DIRECTIVES } = await import(specifier)',
    'const url = import.meta.resolve(specifier)',
    'console.log(JSON.stringify({ url, SECURITY_HEADERS, CSP_DIRECTIVES }))'
  ].join('\n')
  const output = await run({
    file: execPath,
    args: ['--input-type=module', '--eval', script],
    cwd: app
  })
  const loaded: unknown = JSON.parse(output)

  assert.deepEqual(loaded, {
    url: pathToFileURL(
      path.join(packageFolder, 'src/middleware/securityHeaders/constants.js')
    ).href,
    SECURITY_HEADERS,
    CSP_DIRECTIVES
  })
}

async function assertExportTargets({
  entries,
  packageFolder
}: Installation): Promise<void> {
  const manifest: unknown = JSON.parse(
    await readFile(path.join(packageFolder, 'package.json'), 'utf8')
  )
  assert.ok(
    typeof manifest === 'object' && manifest !== null && 'exports' in manifest
  )
  const targets = exportTargets(manifest.exports)
  const publicEntries = Object.keys(manifest.exports ?? {})
  assert.ok(
    !publicEntries.some(entry => /public-message|registration/u.test(entry))
  )
  const missing = targets.filter(
    target => !entries.includes(path.posix.join('package', target))
  )

  assert.ok(targets.length > 0, 'The manifest has no export target.')
  assert.deepEqual(missing, [])
}

function assertNoTests({ entries }: Installation): void {
  const published = entries.filter(
    entry =>
      entry.split('/').includes('__tests__') ||
      entry.startsWith('package/tooling/') ||
      entry.startsWith('package/src/tests/')
  )

  assert.ok(entries.length > 0, 'The tarball is empty.')
  assert.deepEqual(published, [])
}

test('the packed package installs as a dependency', async context => {
  const destination = await temporaryFolder('solid-runtime-pack-')
  context.after(() => rm(destination, { recursive: true, force: true }))
  const app = await temporaryFolder('solid-runtime-app-')
  context.after(() => rm(app, { recursive: true, force: true }))
  const installation = await install({ tarball: await pack(destination), app })

  await context.test('the header constants load in plain Node', () =>
    assertConstantsLoad(installation)
  )
  await context.test('every target of exports is in the tarball', () =>
    assertExportTargets(installation)
  )
  await context.test('no __tests__ folder is published', () => {
    assertNoTests(installation)
  })
})
