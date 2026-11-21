import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { parse } from 'yaml'

import manifest from '../../../package.json' with { type: 'json' }
import generator from '../../../packages/create-solid/package.json' with { type: 'json' }
import inventory from '../../../packages/create-solid/tooling/scenarios.json' with { type: 'json' }
import releaseConfig from '../../../release-please-config.json' with { type: 'json' }
import { readFields } from '../../release/mergePullRequest/json.ts'
import { classify } from '../classify.ts'

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a workflow mapping')
  }
  return Object.fromEntries(Object.entries(value))
}
async function jobs(name: string): Promise<Record<string, unknown>> {
  const workflow: unknown = parse(
    await readFile(`.github/workflows/${name}.yml`, 'utf8')
  )
  return record(record(workflow).jobs)
}
function steps(job: unknown): Record<string, unknown>[] {
  const { steps: values } = record(job)
  assert.ok(Array.isArray(values))
  return values.map((value: unknown) => record(value))
}
function includesGenerator(plugin: {
  components?: readonly string[]
}): boolean {
  return plugin.components?.includes('create-solid') ?? false
}
function expression(value: string) {
  return `\${{ ${value} }}`
}
const ci = await jobs('ci')
const release = await jobs('release')
for (const [name, value] of [
  ['CI', ci.required],
  ['Release', release.verified]
] as const) {
  test(`${name} requires the attempt checker`, () => {
    const job = record(value)
    assert.equal(
      job.if,
      name === 'CI'
        ? 'always()'
        : "always() && needs.release-please.outputs.releases-created == 'true'"
    )
    assert.equal(record(job.permissions).actions, 'read')
    assert.equal(job['continue-on-error'], undefined)
    const step = steps(job).find(
      item => item.run === 'node tooling/ci/required.ts'
    )
    assert.ok(step)
    assert.equal(step.if, undefined)
    assert.equal(step['continue-on-error'], undefined)
    assert.deepEqual(step.env, {
      GH_TOKEN: expression('github.token'),
      NEEDS: expression('toJSON(needs)'),
      ...(name === 'CI'
        ? { EXPECTED: expression('needs.changes.outputs.expected') }
        : {})
    })
  })
}
test('routes every classifier output and waits for every selected job', () => {
  const result = classify({ event: 'schedule' })
  assert.deepEqual(
    record(ci.changes).outputs,
    Object.fromEntries(
      Object.keys(result).map(key => [
        key,
        expression(`steps.classify.outputs.${key}`)
      ])
    )
  )
  assert.equal(
    steps(ci.changes).find(step => step.id === 'classify')?.run,
    'node tooling/ci/changes.ts'
  )
  const { needs } = record(ci.required)
  assert.ok(Array.isArray(needs))
  assert.deepEqual(
    needs
      .map((name: unknown) => {
        assert.ok(typeof name === 'string')
        return name
      })
      .toSorted(),
    Object.keys(ci)
      .filter(key => key !== 'required')
      .toSorted()
  )
  assert.deepEqual(
    needs
      .map((name: unknown) => {
        assert.ok(typeof name === 'string')
        return name
      })
      .toSorted(),
    Object.keys(result.expected).toSorted()
  )
  for (const [id, key] of Object.entries({
    docs: 'docs',
    packages: 'packages',
    consistency: 'consistency',
    generator: 'generator',
    scenario: 'generator',
    app: 'app',
    'app-e2e': 'app'
  })) {
    assert.equal(record(ci[id]).if, `needs.changes.outputs.${key} == 'true'`)
  }
  assert.equal(record(ci['merge-message']).if, "github.event_name == 'push'")
  assert.ok(
    steps(ci.consistency).some(
      step =>
        typeof step.run === 'string' &&
        step.run.split('\n').includes('vp run test:ci')
    )
  )
})
test('keeps the installed scenarios and package builds in their jobs', () => {
  for (const workflow of [ci, release]) {
    const { strategy } = record(workflow.scenario)
    const { matrix } = record(strategy)
    assert.deepEqual(
      record(matrix).scenario,
      inventory.map(({ name }) => name)
    )
  }
  for (const id of ['app', 'app-e2e']) {
    const step = steps(ci[id]).find(item => item.name === 'Build the packages')
    const command = readFields({ value: step, label: id }).string('run')
    assert.equal(
      command.trim().split(/\s+/u).join(' '),
      'vp run --fail-if-no-match --filter @evertondgn/solid-tooling --filter @evertondgn/vite-plugin-solid-icons build'
    )
  }
  assert.deepEqual(
    steps(ci['app-e2e'])
      .map(step => step.run)
      .filter(
        command =>
          typeof command === 'string' && command.startsWith('vp run test:e2e')
      ),
    ['vp run test:e2e', 'vp run test:e2e:production']
  )
  assert.equal(
    steps(release.publish).find(
      step => step.name === 'Build published packages'
    )?.run,
    Object.hasOwn(releaseConfig.packages, 'packages/create-solid') ||
      releaseConfig.plugins.some(includesGenerator)
      ? 'vp run build'
      : 'vp run build:published'
  )
  assert.deepEqual(record(release.publish).needs, [
    'release-please',
    'verified'
  ])
  assert.deepEqual(record(release.verified).needs, [
    'release-please',
    'verify',
    'scenario'
  ])
  const validations: string[] = []
  for (const [name, job] of Object.entries(release)) {
    for (const step of steps(job)) {
      if (typeof step.run === 'string') {
        validations.push(
          ...step.run
            .split('\n')
            .filter(line => line.trim() === 'vp run validate')
            .map(() => name)
        )
      }
    }
  }
  assert.deepEqual(validations, ['verify'])
  assert.deepEqual(
    manifest.scripts.validate.split(' && ').toSorted(),
    [
      'build:published',
      'check',
      'dead-code',
      'test:published',
      'test:tarball:published',
      'test:consistency',
      'test:scenarios:published',
      'test:ci'
    ]
      .map(name => `vp run ${name}`)
      .toSorted()
  )
  assert.equal(
    manifest.scripts['test:scenarios:published'],
    'node --test --test-timeout=180000 packages/solid-tooling/src/tarball/__tests__/tarball.scenarios.test.ts'
  )
})

test('runs prepared artifact validation in the generator gate', () => {
  assert.ok(
    generator.scripts['test:validated']
      .split(' ')
      .includes('__tests__/prepared-artifacts.validation.ts')
  )
  assert.ok(
    manifest.scripts['validate:generator']
      .split(' && ')
      .includes(
        'vp run --fail-if-no-match --filter @evertondgn/create-solid test:validated'
      )
  )
})

test('accepts release plugins with no component list', () => {
  assert.equal(includesGenerator({}), false)
  assert.equal(includesGenerator({ components: ['create-solid'] }), true)
})
