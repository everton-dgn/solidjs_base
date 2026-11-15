import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readOptions } from '../options.ts'

describe('mergePullRequest options', () => {
  it('reads the number, the dry run and the default durations', () => {
    assert.deepEqual(readOptions(['41', '--dry-run']), {
      isHelp: false,
      number: 41,
      isDryRun: true,
      timing: {
        interval: 30_000,
        checkTimeout: 3_600_000,
        registryTimeout: 600_000
      }
    })
  })

  it('merges for real only without --dry-run', () => {
    const options = readOptions(['41'])
    assert.equal(options.isHelp || options.isDryRun, false)
  })

  it('converts the durations it receives', () => {
    const options = readOptions([
      '41',
      '--interval',
      '5',
      '--timeout',
      '2',
      '--registry-timeout',
      '1'
    ])
    assert.deepEqual(options.isHelp ? undefined : options.timing, {
      interval: 5000,
      checkTimeout: 120_000,
      registryTimeout: 60_000
    })
  })

  it('refuses an unknown option instead of ignoring it', () => {
    assert.throws(() => readOptions(['41', '--dryrun']), /Unknown option/u)
  })

  it('refuses a missing, repeated or invalid number', () => {
    for (const args of [[], ['41', '42'], ['#41'], ['0']]) {
      assert.throws(() => readOptions(args), /number of one pull request/u)
    }
  })

  it('refuses a duration that is not positive', () => {
    assert.throws(
      () => readOptions(['41', '--timeout', '0']),
      /--timeout takes a positive number/u
    )
  })

  it('prints the help', () => {
    assert.deepEqual(readOptions(['--help']), { isHelp: true })
  })
})
