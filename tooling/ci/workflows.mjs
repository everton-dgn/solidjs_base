import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { scenarios } from '../../packages/create-solid/tooling/scenarios.ts'

for (const workflow of ['ci', 'release']) {
  const file = readFileSync(`.github/workflows/${workflow}.yml`, 'utf8')
  const parsed = Bun.YAML.parse(file)
  assert.deepEqual(
    parsed.jobs.scenario.strategy.matrix.scenario,
    scenarios.map(scenario => scenario.name)
  )
}
