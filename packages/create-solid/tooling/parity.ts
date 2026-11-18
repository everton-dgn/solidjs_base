import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { parse } from 'valibot'

import { manifestSchema } from '../src/types.ts'

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
    const { version } = parse(
      manifestSchema,
      JSON.parse(readFileSync('package.json', 'utf8'))
    )
    // The release changes only pinned package versions and the documentation tag.
    const snapshot = diff.stdout
      .split('\n')
      .filter(line => !line.startsWith('index '))
      .map(line => {
        if (!line.startsWith('+')) return line
        let normalized = line.replaceAll(
          `/create-solid@${version}/`,
          '/create-solid@{version}/'
        )
        for (const name of ['solid-runtime', 'solid-tooling']) {
          normalized = normalized.replace(
            `"@evertondgn/${name}": "${version}"`,
            `"@evertondgn/${name}": "{version}"`
          )
        }
        return normalized
      })
      .join('\n')
    if (process.argv.includes('--update')) {
      writeFileSync(expected, snapshot)
    } else assert.equal(snapshot, readFileSync(expected, 'utf8'))
    rmSync(path.join(sandbox, 'example'), { recursive: true })
    process.stdout.write(`Packed ${pm} profile compared against git archive\n`)
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
