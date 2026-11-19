import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { normalizePackedDiff } from './normalize-diff.ts'

const sourceTree = execFileSync('git', ['rev-parse', 'HEAD:apps/boilerplate'], {
  encoding: 'utf8'
})
if (sourceTree !== readFileSync('app-tree.txt', 'utf8')) {
  throw new Error('Update app-tree.txt with the reviewed application tree')
}

const archiveLimit = 64_000_000
const sandbox = mkdtempSync(path.join(tmpdir(), 'solid-parity-'))
try {
  execFileSync('vp', ['pm', 'pack', '--pack-destination', sandbox])
  const { readdirSync } = await import('node:fs')
  const packed = readdirSync(sandbox).find(file => file.endsWith('.tgz'))
  assert.ok(packed)
  process.stdout.write(
    `Packed ${packed} (${readFileSync(path.join(sandbox, packed)).length} bytes)\n`
  )
  execFileSync('tar', ['xf', packed], { cwd: sandbox })
  assert.ok(!existsSync(path.join(sandbox, 'package/dist/formatter')))
  const scope = path.join(sandbox, 'node_modules/@evertondgn')
  mkdirSync(scope, { recursive: true })
  symlinkSync(path.join(sandbox, 'package'), path.join(scope, 'create-solid'))
  writeFileSync(
    path.join(sandbox, 'consumer.mts'),
    [
      "import { generate, type Profile } from '@evertondgn/create-solid'",
      "const profile: Profile = { dir: 'app', pm: 'bun', shouldInstall: false, shouldInitGit: false }",
      'export const steps: string[] = generate(profile)'
    ].join('\n')
  )
  writeFileSync(
    path.join(sandbox, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        types: [],
        module: 'NodeNext',
        target: 'ES2024'
      },
      files: ['consumer.mts']
    })
  )
  execFileSync(
    path.resolve('../../node_modules/.bin/tsc'),
    ['--project', sandbox],
    { stdio: 'inherit' }
  )
  const source = path.join(sandbox, 'source')
  mkdirSync(source)
  const archive = execFileSync('git', ['archive', 'HEAD:apps/boilerplate'], {
    cwd: '../..',
    maxBuffer: archiveLimit
  })
  execFileSync('tar', ['xf', '-'], { cwd: source, input: archive })
  for (const pm of ['bun', 'pnpm', 'npm']) {
    const expected = `expected.${pm}.diff`
    execFileSync(
      process.execPath,
      [
        'package/dist/create-solid.mjs',
        'example',
        '--title',
        'SolidJS Boilerplate',
        '--no-install',
        '--no-git',
        '--pm',
        pm
      ],
      { cwd: sandbox }
    )
    const diff = spawnSync(
      'git',
      [
        'diff',
        '--no-index',
        '--no-color',
        '--binary',
        '--',
        'source',
        'example'
      ],
      { cwd: sandbox, encoding: 'utf8' }
    )
    assert.equal(diff.status, 1, diff.stderr)
    // The release changes only pinned package versions and the documentation tag.
    const snapshot = normalizePackedDiff({
      diff: diff.stdout,
      directory: path.join(sandbox, 'package')
    })
    if (process.argv.includes('--update')) {
      writeFileSync(expected, snapshot)
    } else assert.equal(snapshot, readFileSync(expected, 'utf8'))
    rmSync(path.join(sandbox, 'example'), { recursive: true })
    process.stdout.write(`Packed ${pm} profile compared against git archive\n`)
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
