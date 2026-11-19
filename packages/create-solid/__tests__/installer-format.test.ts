import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { object, parse, string } from 'valibot'

void it('pins the installer formatter to the version used by Vite+ and produces the same YAML', () => {
  const metadata = object({ dependencies: object({ oxfmt: string() }) })
  const pin = (file: string) =>
    parse(metadata, JSON.parse(readFileSync(file, 'utf8'))).dependencies.oxfmt
  const declared = pin('package.json')
  const vite = fileURLToPath(import.meta.resolve('vite-plus/package.json'))
  assert.equal(pin(vite), `=${declared}`)
  const oxfmt = fileURLToPath(import.meta.resolve('oxfmt/package.json'))
  const installed = parse(
    object({ version: string() }),
    JSON.parse(readFileSync(oxfmt, 'utf8'))
  )
  assert.equal(installed.version, declared)
  const options = {
    cwd: path.resolve('dist/formatter'),
    input: 'minimumReleaseAgeExclude:\n  - "@example/pkg"\n',
    encoding: 'utf8'
  } as const
  const args = ['--stdin-filepath=pnpm-workspace.yaml']
  const actual = execFileSync(
    process.execPath,
    [
      path.join(path.dirname(oxfmt), 'bin/oxfmt'),
      '--config',
      'oxfmt.json',
      ...args
    ],
    options
  )
  const expected = execFileSync(
    path.resolve('../../node_modules/.bin/vp'),
    ['fmt', ...args],
    options
  )
  assert.equal(actual, expected)
})
