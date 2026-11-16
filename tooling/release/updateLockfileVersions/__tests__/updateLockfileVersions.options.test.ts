import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readOptions } from '../options.ts'

const GENERATED = '/tmp/lockfile/bun.lock'

describe('updateLockfileVersions options', () => {
  it('reads the path of the generated lockfile', () => {
    assert.deepEqual(readOptions([GENERATED]), {
      isHelp: false,
      generated: GENERATED
    })
  })

  it('prints the help', () => {
    assert.deepEqual(readOptions(['--help']), { isHelp: true })
  })

  for (const args of [[], [GENERATED, GENERATED]]) {
    it(`refuses ${args.length} paths`, () => {
      assert.throws(() => readOptions(args), {
        message: `Pass the path of one generated lockfile, not ${args.length}, as in: node tooling/release/update-lockfile-versions.ts "$RUNNER_TEMP"/lockfile/bun.lock`
      })
    })
  }

  it('refuses an unknown option', () => {
    assert.throws(() => readOptions([GENERATED, '--write', 'x']))
  })
})
