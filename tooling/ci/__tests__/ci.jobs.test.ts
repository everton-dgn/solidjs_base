import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { promisify } from 'node:util'

import inventory from '../../../packages/create-solid/tooling/scenarios.json' with { type: 'json' }
import { classify, scenarioJobs } from '../classify.ts'
import { releaseExpected, verify } from '../results.ts'

const full = ['app', 'docs', 'generator', 'packages']
const routes: [string, string[]][] = [
  ['docs/tooling/no-server.md', ['docs']],
  ['README.md', ['docs']],
  ['.github/templates/example.md', ['docs']],
  ['packages/solid-runtime/README.md', ['docs']],
  ['packages/solid-tooling/CHANGELOG.md', ['docs']],
  ['apps/boilerplate/fonts.ts', ['app', 'generator']],
  ['packages/create-solid/docs/install.md', ['docs', 'generator']],
  ['packages/solid-runtime/src/index.ts', full],
  ['apps/boilerplate/AGENTS.md', ['app', 'docs', 'generator']],
  ['apps/boilerplate/patches/fix.patch', ['app', 'generator', 'packages']],
  ['apps/boilerplate/package.json', ['app', 'generator', 'packages']],
  ['packages/solid-tooling/docs/install.md', ['docs', 'generator', 'packages']],
  ['packages/solid-tooling/src/vite/tasks.ts', full],
  ['bun.lock', full],
  ['packages/create-solid/package.json', full],
  ['packages/solid-runtime/src/example.md', full],
  ['fixtures/example.md', full]
]
for (const [filename, enabled] of routes) {
  test(`routes ${filename}`, () => {
    const { expected, consistency, ...flags } = classify({
      event: 'pull_request',
      files: [{ filename, status: 'modified' }]
    })
    assert.ok(consistency)
    assert.deepEqual(
      Object.entries(flags)
        .filter(([, value]) => value)
        .map(([key]) => key)
        .toSorted(),
      enabled
    )
    assert.equal(
      expected.scenario?.length,
      enabled.includes('generator') ? inventory.length : 0
    )
  })
}
test('checks both paths of a rename and links to removed files', () => {
  assert.ok(
    classify({
      event: 'pull_request',
      files: [
        {
          filename: 'docs/new.md',
          previous_filename: 'apps/boilerplate/old.ts',
          status: 'renamed'
        }
      ]
    }).app
  )
  assert.ok(
    classify({
      event: 'pull_request',
      files: [{ filename: 'apps/boilerplate/fonts.ts', status: 'removed' }]
    }).docs
  )
})
test('selects every suite without requesting a file listing', async () => {
  for (const [event, payload] of Object.entries({
    release: {
      pull_request: { head: { ref: 'release-please--main' }, changed_files: 1 }
    },
    large: { pull_request: { changed_files: 3000 } },
    missing: {},
    push: { forced: true },
    schedule: {}
  })) {
    const directory = await mkdtemp(path.join(tmpdir(), 'ci-event-'))
    try {
      const input = path.join(directory, 'event'),
        output = path.join(directory, 'output')
      await writeFile(input, JSON.stringify(payload))
      await promisify(execFile)(process.execPath, ['tooling/ci/changes.ts'], {
        env: {
          PATH: '',
          GITHUB_EVENT_NAME: ['push', 'schedule'].includes(event)
            ? event
            : 'pull_request',
          GITHUB_EVENT_PATH: input,
          GITHUB_OUTPUT: output
        }
      })
      const stdout = await readFile(output, 'utf8')
      const lines = stdout.trim().split('\n')
      for (const key of [
        'packages',
        'docs',
        'app',
        'generator',
        'consistency'
      ]) {
        assert.ok(lines.includes(`${key}=true`))
      }
      const expected = lines.find(line => line.startsWith('expected='))
      assert.ok(expected)
      const map: unknown = JSON.parse(expected.slice('expected='.length))
      assert.ok(map !== null && typeof map === 'object' && 'scenario' in map)
      assert.deepEqual(map.scenario, scenarioJobs)
    } finally {
      await rm(directory, { recursive: true })
    }
  }
})
const scenarios = inventory.map(({ name }) => `Generated app (${name})`)
const cases: Record<string, Record<string, string[]>> = {
  pull_request: {
    changes: ['Changes'],
    'merge-message': [],
    docs: ['Docs'],
    packages: ['Packages'],
    generator: ['Generator'],
    app: ['Boilerplate app'],
    'app-e2e': ['Boilerplate app E2E'],
    consistency: ['Consistency'],
    scenario: scenarios
  },
  push: {
    changes: ['Changes'],
    'merge-message': ['Merge commit body'],
    docs: [],
    packages: [],
    generator: [],
    app: [],
    'app-e2e': [],
    consistency: [],
    scenario: []
  },
  Release: { verify: ['Verify'], scenario: scenarios }
}
for (const [event, expected] of Object.entries(cases)) {
  test(`accepts the complete ${event} map`, () => {
    const actual =
      event === 'Release'
        ? releaseExpected()
        : classify({
            event,
            isChecked: event === 'push',
            files:
              event === 'push'
                ? []
                : [{ filename: 'bun.lock', status: 'modified' }]
          }).expected
    assert.deepEqual(actual, expected)
    verify({
      expected: actual,
      needs: Object.fromEntries(
        Object.entries(expected).map(([key, names]) => [
          key,
          { result: names.length > 0 ? 'success' : 'skipped' }
        ])
      ),
      jobs: Object.values(expected)
        .flat()
        .map(name => ({ name, conclusion: 'success' }))
    })
  })
}
test('rejects missing, skipped, duplicated and cancelled jobs', () => {
  const expected = { scenario: ['Generated app (bun)'] },
    needs = { scenario: { result: 'success' } },
    job = { name: 'Generated app (bun)', conclusion: 'success' }
  for (const jobs of [
    [],
    [job, job],
    [{ ...job, conclusion: 'cancelled', runner_id: null }]
  ]) {
    assert.throws(() => verify({ expected, needs, jobs }))
  }
  const invalidNeeds: Record<string, { result: string }>[] = [
    {},
    { scenario: { result: 'skipped' } }
  ]
  for (const dependencies of invalidNeeds) {
    assert.throws(() => verify({ expected, needs: dependencies, jobs: [job] }))
  }
})
