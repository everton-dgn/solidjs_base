/* oxlint-disable node/no-sync -- The test builds the application step by step and waits for the real CLIs. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import * as v from 'valibot'

type Command = { file: string; args: string[]; cwd: string }
type Expected = { filename: string; code: string }
type Diagnostic = v.InferOutput<typeof diagnosticSchema>
type Installation = { app: string; tarball: string }
type ErrorQuery = { diagnostics: Diagnostic[]; expected: Expected }

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..')
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '../..')
const FIXTURE = path.join(WORKSPACE_ROOT, 'fixtures/consumer')
const VP = path.join(WORKSPACE_ROOT, 'node_modules/.bin/vp')
const PACKAGE_NAME = '@evertondgn/solid-tooling'
const COMMAND_TIMEOUT = 120_000
// These protocols only resolve inside the workspace; in a published package
// the application install would fail.
const WORKSPACE_PROTOCOLS = ['catalog:', 'workspace:']
const SHARED_VERSIONS = ['typescript', 'vite-plus', '@inlang/paraglide-js']
const EXPECTED: Expected[] = [
  { filename: 'src/helpers/export-list.ts', code: 'project(no-export-list)' },
  {
    filename: 'src/helpers/dynamic-solid.ts',
    code: 'backend(static-solid-imports)'
  },
  { filename: 'src/helpers/layer.ts', code: 'architecture(layer-imports)' },
  { filename: 'src/helpers/type-error.ts', code: 'typescript(TS2322)' },
  {
    filename: 'src/components/atoms/greeting.tsx',
    code: 'solid(no-destructure)'
  }
]
// vite.config.ts imports the preset: with no diagnostics, the package
// declarations resolved in the application.
const CLEAN_FILES = ['src/helpers/clean.ts', 'vite.config.ts']

const versionsSchema = v.optional(v.record(v.string(), v.string()), {})
const manifestSchema = v.object({
  dependencies: versionsSchema,
  devDependencies: versionsSchema,
  peerDependencies: versionsSchema,
  catalog: versionsSchema,
  engines: v.optional(v.unknown()),
  devEngines: v.optional(v.unknown())
})
const diagnosticSchema = v.object({
  filename: v.string(),
  code: v.optional(v.string(), ''),
  severity: v.string()
})
const reportSchema = v.object({ diagnostics: v.array(diagnosticSchema) })

function run({ file, args, cwd }: Command): string {
  const result = spawnSync(file, args, {
    cwd,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT
  })
  assert.equal(
    result.status,
    0,
    `${file} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`
  )
  return result.stdout
}

function readManifest(source: string): v.InferOutput<typeof manifestSchema> {
  return v.parse(manifestSchema, JSON.parse(source))
}

function pack(directory: string): string {
  const destination = path.join(directory, 'pack')
  run({
    file: VP,
    args: ['pm', 'pack', '--pack-destination', destination],
    cwd: PACKAGE_ROOT
  })
  const tarball = readdirSync(destination).find(name => name.endsWith('.tgz'))
  assert.ok(tarball, 'vp pm pack did not produce the tarball.')
  return path.join(destination, tarball)
}

function assertInstallable(tarball: string): void {
  const manifest = readManifest(
    run({
      file: 'tar',
      args: ['-xzOf', tarball, 'package/package.json'],
      cwd: path.dirname(tarball)
    })
  )
  const versions = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.peerDependencies
  ].flatMap(group => Object.entries(group))
  for (const [name, version] of versions) {
    assert.ok(
      !WORKSPACE_PROTOCOLS.some(protocol => version.startsWith(protocol)),
      `${name} was packed with ${version}.`
    )
  }
}

function install({ app, tarball }: Installation): void {
  cpSync(FIXTURE, app, {
    recursive: true,
    filter: source => !source.split(path.sep).includes('node_modules')
  })
  const manifestPath = path.join(app, 'package.json')
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.ok(manifest !== null && typeof manifest === 'object')
  const { devDependencies } = readManifest(JSON.stringify(manifest))
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...manifest,
      devDependencies: { ...devDependencies, [PACKAGE_NAME]: tarball }
    })
  )
  run({ file: VP, args: ['install'], cwd: app })
}

function lint(app: string): Diagnostic[] {
  // The deliberate violations make lint exit with a non-zero code.
  const result = spawnSync(
    path.join(app, 'node_modules/.bin/vp'),
    ['lint', 'src', 'vite.config.ts', '--format', 'json'],
    { cwd: app, encoding: 'utf8', timeout: COMMAND_TIMEOUT }
  )
  assert.notEqual(result.stdout, '', result.stderr)
  return v.parse(reportSchema, JSON.parse(result.stdout)).diagnostics
}

function isFile(diagnostic: Diagnostic, filename: string): boolean {
  return (
    diagnostic.filename === filename ||
    diagnostic.filename.endsWith(`/${filename}`)
  )
}

function hasError({ diagnostics, expected }: ErrorQuery): boolean {
  return diagnostics.some(
    diagnostic =>
      isFile(diagnostic, expected.filename) &&
      diagnostic.severity === 'error' &&
      diagnostic.code === expected.code
  )
}

test('the fixture declares the same versions as the workspace', () => {
  const workspace = readManifest(
    readFileSync(path.join(WORKSPACE_ROOT, 'package.json'), 'utf8')
  )
  const fixture = readManifest(
    readFileSync(path.join(FIXTURE, 'package.json'), 'utf8')
  )
  for (const name of SHARED_VERSIONS) {
    const expected = workspace.catalog[name] ?? workspace.devDependencies[name]
    assert.equal(fixture.devDependencies[name], expected, name)
  }
  assert.deepEqual(fixture.engines, workspace.engines)
  assert.deepEqual(fixture.devEngines, workspace.devEngines)
})

test('the application installs the packed package and lint applies the plugins', context => {
  const directory = mkdtempSync(path.join(tmpdir(), 'solid-tooling-consumer-'))
  // Sandbox created by this test: removing it directly is the right cleanup.
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const tarball = pack(directory)
  assertInstallable(tarball)
  const app = path.join(directory, 'app')
  install({ app, tarball })

  const diagnostics = lint(app)

  for (const expected of EXPECTED) {
    assert.ok(
      hasError({ diagnostics, expected }),
      `${expected.code} was not reported in ${expected.filename}.`
    )
  }
  assert.deepEqual(
    diagnostics.filter(diagnostic =>
      CLEAN_FILES.some(filename => isFile(diagnostic, filename))
    ),
    []
  )
})
