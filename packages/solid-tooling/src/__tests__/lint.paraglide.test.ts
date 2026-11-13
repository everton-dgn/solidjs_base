import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execPath } from 'node:process'
import { it } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

type LintSummary = v.InferOutput<typeof summarySchema>

const exec = promisify(execFile)
const LINT = new URL('../lint.ts', import.meta.url).href
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const PARAGLIDE_RULE = 'paraglide/no-dynamic-message-access'

const summarySchema = v.object({
  plugins: v.array(v.string()),
  hasRule: v.boolean()
})

// The preset decides at import time, from the folder where lint runs, so each
// case loads it in a process of its own.
async function summarize(cwd: string): Promise<LintSummary> {
  const script = `
const { lint } = await import(${JSON.stringify(LINT)})
process.stdout.write(JSON.stringify({
  plugins: lint.jsPlugins.map(plugin => plugin.name),
  hasRule: ${JSON.stringify(PARAGLIDE_RULE)} in lint.rules
}))`
  const { stdout } = await exec(
    execPath,
    ['--input-type=module', '--eval', script],
    { cwd }
  )
  return v.parse(summarySchema, JSON.parse(stdout))
}

it('registers the Paraglide plugin and rule where Paraglide is installed', async () => {
  const summary = await summarize(PACKAGE_ROOT)
  assert.ok(summary.plugins.includes('paraglide'), summary.plugins.join(', '))
  assert.equal(summary.hasRule, true)
})

it('leaves out the Paraglide plugin and rule where Paraglide is missing', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'solid-lint-no-i18n-'))
  // Sandbox created by this test: removing it directly is the right cleanup.
  context.after(() => rm(directory, { recursive: true, force: true }))
  const summary = await summarize(directory)
  assert.equal(summary.plugins.includes('paraglide'), false)
  assert.equal(summary.hasRule, false)
  assert.ok(summary.plugins.includes('project'), summary.plugins.join(', '))
})
