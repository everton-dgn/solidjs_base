import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execPath } from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

type Command = { file: string; args: string[]; cwd: string }
type CommandFailure = Error & { stdout: string }
type Installation = { entries: string[]; packageFolder: string; app: string }
type InstallOptions = { tarball: string; app: string }
type DependencyMap = Record<string, string>
type Manifest = {
  exports?: unknown
  dependencies?: DependencyMap
  peerDependencies?: DependencyMap
  optionalDependencies?: DependencyMap
  devDependencies?: DependencyMap
}

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..')
const PACKAGE_NAME = '@evertondgn/vite-plugin-solid-icons'
const VP = path.join(PACKAGE_ROOT, 'node_modules/.bin/vp')
const TSRS = fileURLToPath(
  new URL('bin/tsrs', import.meta.resolve('tsrs/package.json'))
)
const COMMAND_TIMEOUT = 60_000
// WHY: an application installs the plugin with its own Vite and Solid plugin;
// in dependencies they would install a second copy.
const BUILD_TOOLS = [
  '@solidjs/vite-plugin',
  'vite',
  'vite-plus',
  'vitest',
  'rolldown'
]
// These protocols only resolve inside the workspace.
const WORKSPACE_PROTOCOLS = ['catalog:', 'workspace:']
// The installed package resolves these from the application.
const LINKED_PACKAGES = [
  '@iconify',
  '@iconify-json',
  '@solidjs',
  'magic-string',
  'vite-plus'
]
const TYPE_USAGE = `import type { JSX } from '@solidjs/web'
import { ArrowLeft01, Github as GithubIcon } from 'icon:hugeicons'
import Github from 'icon:hugeicons/github'
import githubSvg from 'icon:hugeicons/github?raw'
import Logo from 'icon:own/logo.v2'
import { LogoV2 } from 'icon:own'

export const svg: string = githubSvg
export const element: JSX.Element = Github({ class: 'icon', 'aria-label': 'GitHub' })
export const logo: JSX.Element = Logo({})
// @ts-expect-error The raw import is a string, not a component.
export const notComponent = githubSvg({})
// @ts-expect-error The component takes the props of an svg element.
export const wrongProps = Github(42)
// @ts-expect-error The component is not a string.
export const notString: string = Github
export const back: JSX.Element = ArrowLeft01({ class: 'icon' })
export const ownLogo: JSX.Element = LogoV2({})
export const sameComponent: typeof Github = GithubIcon
// @ts-expect-error A named icon takes the props of an svg element.
export const wrongNamedProps = GithubIcon(42)
`
const TYPO_USAGE = `import { Githb } from 'icon:hugeicons'

export const icon = Githb
`
const TYPES_FILE = 'src/icon-collections.d.ts'
// The application writes the declarations of the named imports before its
// first type check.
const WRITE_TYPES = [
  `const { writeIconTypes } = await import(${JSON.stringify(PACKAGE_NAME)})`,
  'await writeIconTypes({ collections: { own: "./icons" } })'
].join('\n')
const APP_MANIFEST = {
  name: 'icons-app',
  private: true,
  devDependencies: { '@iconify-json/hugeicons': '*' }
}
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>'
const TYPE_CONFIG = {
  compilerOptions: {
    strict: true,
    noEmit: true,
    target: 'es2024',
    lib: ['ES2024', 'DOM'],
    module: 'esnext',
    moduleResolution: 'bundler',
    jsx: 'preserve',
    jsxImportSource: '@solidjs/web',
    types: [`${PACKAGE_NAME}/icon-modules`]
  },
  files: ['icons.ts', TYPES_FILE]
}
const TYPO_CONFIG = { ...TYPE_CONFIG, files: ['typo.ts', TYPES_FILE] }

const execFileAsync = promisify(execFile)

async function run({ file, args, cwd }: Command): Promise<string> {
  const { stdout } = await execFileAsync(file, args, {
    cwd,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT
  })
  return stdout
}

// The real path, because the temporary folder of macOS is a symbolic link.
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

// The layout of an installation, without the network: the tarball extracted
// to node_modules of another folder, next to links to its dependencies.
async function install({
  tarball,
  app
}: InstallOptions): Promise<Installation> {
  const modules = path.join(app, 'node_modules')
  const packageFolder = path.join(modules, PACKAGE_NAME)
  await mkdir(packageFolder, { recursive: true })
  await run({
    file: 'tar',
    args: ['-xzf', tarball, '-C', packageFolder, '--strip-components=1'],
    cwd: app
  })
  for (const scope of LINKED_PACKAGES) {
    await symlink(
      path.join(PACKAGE_ROOT, 'node_modules', scope),
      path.join(modules, scope)
    )
  }
  const listing = await run({ file: 'tar', args: ['-tzf', tarball], cwd: app })
  const entries = listing.split('\n').filter(entry => entry !== '')
  return { entries, packageFolder, app }
}

function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null
}

async function readManifest(file: string): Promise<Manifest> {
  const manifest: unknown = JSON.parse(await readFile(file, 'utf8'))
  assert.ok(isManifest(manifest), `${file} is not a manifest.`)
  return manifest
}

function exportTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object' || value === null) return []
  return Object.values(value).flatMap(entry => exportTargets(entry))
}

async function assertExportTargets({
  entries,
  packageFolder
}: Installation): Promise<void> {
  const manifest = await readManifest(path.join(packageFolder, 'package.json'))
  const targets = exportTargets(manifest.exports)
  const missing = targets.filter(
    target => !entries.includes(path.posix.join('package', target))
  )

  assert.ok(targets.includes('./icon-modules.d.ts'))
  assert.deepEqual(missing, [])
}

async function assertDependencies({
  packageFolder
}: Installation): Promise<void> {
  const manifest = await readManifest(path.join(packageFolder, 'package.json'))
  const installed = Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies
  })
  const versions = Object.values({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
    ...manifest.devDependencies
  })

  assert.deepEqual(
    BUILD_TOOLS.filter(name => installed.includes(name)),
    []
  )
  assert.deepEqual(
    versions.filter(version =>
      WORKSPACE_PROTOCOLS.some(protocol => version.startsWith(protocol))
    ),
    []
  )
}

async function assertPluginLoads({ app }: Installation): Promise<void> {
  const script = [
    `const { solidIcons } = await import(${JSON.stringify(PACKAGE_NAME)})`,
    'const plugin = solidIcons({ collections: { own: "./icons" } })',
    'console.log(JSON.stringify({ name: plugin.name, enforce: plugin.enforce }))'
  ].join('\n')
  const output = await run({
    file: execPath,
    args: ['--input-type=module', '--eval', script],
    cwd: app
  })

  assert.deepEqual(JSON.parse(output), {
    name: 'vite-plugin-solid-icons',
    enforce: 'pre'
  })
}

function isCommandFailure(error: unknown): error is CommandFailure {
  return (
    error instanceof Error &&
    'stdout' in error &&
    typeof error.stdout === 'string'
  )
}

// The output of a command that has to fail.
async function runFailing(command: Command): Promise<string> {
  let failure: unknown
  try {
    await run(command)
  } catch (error) {
    failure = error
  }
  assert.ok(
    isCommandFailure(failure),
    `${command.file} ${command.args.join(' ')} did not fail.`
  )
  return failure.stdout
}

async function writeAppTypes({ app }: Installation): Promise<void> {
  await writeFile(path.join(app, 'package.json'), JSON.stringify(APP_MANIFEST))
  await mkdir(path.join(app, 'icons'), { recursive: true })
  await writeFile(path.join(app, 'icons/logo.v2.svg'), LOGO_SVG)
  await run({
    file: execPath,
    args: ['--input-type=module', '--eval', WRITE_TYPES],
    cwd: app
  })
}

async function assertTypes(installation: Installation): Promise<void> {
  const { app } = installation
  await writeAppTypes(installation)
  await writeFile(path.join(app, 'icons.ts'), TYPE_USAGE)
  await writeFile(path.join(app, 'tsconfig.json'), JSON.stringify(TYPE_CONFIG))

  await run({ file: TSRS, args: ['-p', 'tsconfig.json'], cwd: app })
}

async function assertTypo({ app }: Installation): Promise<void> {
  await writeFile(path.join(app, 'typo.ts'), TYPO_USAGE)
  await writeFile(
    path.join(app, 'tsconfig.typo.json'),
    JSON.stringify(TYPO_CONFIG)
  )

  const output = await runFailing({
    file: TSRS,
    args: ['-p', 'tsconfig.typo.json'],
    cwd: app
  })

  assert.match(
    output,
    /typo\.ts\(1,10\): error TS2724: '"icon:hugeicons"' has no exported member named 'Githb'\. Did you mean 'Github'\?/u
  )
}

// The license as the package writes it: the copyright of the package above
// the copyright of the code it carries, and the MIT permission for both.
async function assertLicense({ entries, packageFolder }: Installation) {
  assert.deepEqual(
    entries.filter(entry => entry.endsWith('LICENSE')),
    ['package/LICENSE']
  )
  const license = await readFile(path.join(packageFolder, 'LICENSE'), 'utf8')
  assert.equal(
    license,
    await readFile(path.join(PACKAGE_ROOT, 'LICENSE'), 'utf8')
  )
  const copyrights = license
    .split('\n')
    .filter(line => line.startsWith('Copyright (c)'))
  const [own = '', carried = '', ...others] = copyrights
  assert.deepEqual(others, [])
  assert.equal(own, 'Copyright (c) 2026 Éverton Toffanetto')
  assert.match(
    carried,
    /^Copyright \(c\) 2020-PRESENT \S.*<https:\/\/github\.com\/\S+>$/u
  )
  assert.match(license, /^MIT License\n/u)
  assert.match(
    license,
    /Permission is hereby granted, free of charge, to any person obtaining a copy/u
  )
  assert.match(
    license,
    /The above copyright notice and this permission notice shall be included in all\s+copies or substantial portions of the Software\./u
  )
}

test('the packed package installs as a dependency', async context => {
  const destination = await temporaryFolder('solid-icons-pack-')
  context.after(() => rm(destination, { recursive: true, force: true }))
  const app = await temporaryFolder('solid-icons-install-')
  context.after(() => rm(app, { recursive: true, force: true }))
  const installation = await install({ tarball: await pack(destination), app })

  await context.test('the tarball carries the license', () =>
    assertLicense(installation)
  )
  await context.test('no test is published', () => {
    assert.deepEqual(
      installation.entries.filter(
        entry => entry.includes('__tests__') || entry.includes('/src/')
      ),
      []
    )
  })
  await context.test('every target of exports is in the tarball', () =>
    assertExportTargets(installation)
  )
  await context.test('build tools stay out of the dependencies', () =>
    assertDependencies(installation)
  )
  await context.test('the plugin loads in plain Node', () =>
    assertPluginLoads(installation)
  )
  await context.test('an application types the icon imports', () =>
    assertTypes(installation)
  )
  await context.test('a typo in a named import is a type error', () =>
    assertTypo(installation)
  )
})
