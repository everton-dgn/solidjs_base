import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readOptions } from '../options.ts'

const TARBALL = '/tmp/release/evertondgn-solid-tooling-0.8.0.tgz'

describe('waitForPinnedPackages options', () => {
  it('waits up to 10 minutes and reads every 15 seconds by default', () => {
    assert.deepEqual(readOptions([TARBALL]), {
      isHelp: false,
      tarball: TARBALL,
      timing: { timeout: 600_000, interval: 15_000 }
    })
  })

  it('reads the time limit in minutes and the interval in seconds', () => {
    assert.deepEqual(
      readOptions([TARBALL, '--timeout', '0.5', '--interval', '5']),
      {
        isHelp: false,
        tarball: TARBALL,
        timing: { timeout: 30_000, interval: 5000 }
      }
    )
  })

  it('prints the help', () => {
    assert.deepEqual(readOptions(['--help']), { isHelp: true })
  })

  for (const args of [[], [TARBALL, TARBALL]]) {
    it(`refuses ${args.length} tarballs`, () => {
      assert.throws(() => readOptions(args), {
        message: `Pass the path of one tarball, not ${args.length}, as in: node tooling/release/wait-for-pinned-packages.ts "$RUNNER_TEMP"/release/*.tgz`
      })
    })
  }

  for (const value of ['0', '-1', 'ten']) {
    it(`refuses a time limit of ${value}`, () => {
      assert.throws(() => readOptions([TARBALL, `--timeout=${value}`]), {
        message: `--timeout takes a positive number, not "${value}".`
      })
    })
  }

  it('refuses an unknown option', () => {
    assert.throws(() => readOptions([TARBALL, '--registry', 'x']))
  })
})
