import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it, type TestContext } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

type Scenario = {
  options: Record<string, unknown>
  mode?: string
  hasReplacement?: boolean
}
const execute = promisify(execFile)
const PRESET = new URL('../../../dist/vite.mjs', import.meta.url).href
const FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../../fixtures/apps/ssr-i18n'
)
const PluginNamesSchema = v.array(v.string())
const SummarySchema = v.object({
  error: v.nullable(v.string()),
  tasks: v.record(v.string(), v.unknown()),
  plugins: v.record(v.string(), PluginNamesSchema)
})

async function createRoot(context: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'solid-i18n-preset-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await cp(FIXTURE, root, { recursive: true })
  return root
}

async function readSummary({
  options,
  mode = 'production',
  hasReplacement = false
}: Scenario) {
  const script = `
    import { defineSolidApp } from ${JSON.stringify(PRESET)}
    const names = async value => {
      const resolved = await value
      if (!resolved) return []
      if (Array.isArray(resolved)) return (await Promise.all(resolved.map(names))).flat()
      return [resolved.name]
    }
    try {
      const options = ${JSON.stringify({ ...(options.ssr === false ? {} : { securityHeaders: {} }), ...options })}
      if (${JSON.stringify(hasReplacement)}) options.extend = () => ({ plugins: [{ name: 'custom-i18n' }] })
      const preset = defineSolidApp(options)
      const config = preset({ mode: ${JSON.stringify(mode)}, command: 'serve' })
      const [, dom, browser] = config.test.projects
      process.stdout.write(JSON.stringify({ error: null, tasks: config.run.tasks,
        plugins: { app: await names(config.plugins), dom: await names(dom.plugins), browser: await names(browser.plugins) } }))
    } catch (error) {
      process.stdout.write(JSON.stringify({ error: error.message, tasks: {}, plugins: {} }))
    }
  `
  const { stdout } = await execute(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { timeout: 30_000 }
  )
  return v.parse(SummarySchema, JSON.parse(stdout))
}

it('enables i18n in development for both SSR and client-only applications', async context => {
  const root = await createRoot(context)
  for (const options of [
    { root },
    { root, ssr: false, securityHeaders: undefined }
  ]) {
    const summary = await readSummary({ options, mode: 'development' })
    assert.equal(summary.error, null)
    for (const plugins of Object.values(summary.plugins)) {
      assert.ok(plugins.includes('project:i18n-catalogs'))
      assert.ok(plugins.includes('unplugin-paraglide-js'))
    }
  }
})

it('removing the ssr-i18n fixture project disables its task and plugins', async context => {
  const root = await createRoot(context)
  const enabled = await readSummary({ options: { root } })
  assert.equal(enabled.error, null)
  assert.ok('i18n-generate' in enabled.tasks)
  for (const plugins of Object.values(enabled.plugins)) {
    assert.ok(plugins.includes('project:i18n-catalogs'))
    assert.ok(plugins.includes('unplugin-paraglide-js'))
  }
  await rename(
    path.join(root, 'project.inlang'),
    path.join(root, 'disabled-project')
  )
  const disabled = await readSummary({ options: { root } })
  assert.equal(disabled.error, null)
  assert.ok(!('i18n-generate' in disabled.tasks))
  for (const plugins of Object.values(disabled.plugins)) {
    assert.ok(!plugins.some(name => /i18n-catalogs|paraglide/iu.test(name)))
  }
  context.diagnostic(
    JSON.stringify({
      tasks: Object.keys(disabled.tasks),
      plugins: disabled.plugins
    })
  )
})

it('keeps generation replaceable by name when the automatic plugin is disabled', async context => {
  const root = await createRoot(context)
  const task = { command: 'bun custom-generator.ts', cache: false }
  const summary = await readSummary({
    options: { root, i18nPlugin: false, tasks: { 'i18n-generate': task } }
  })
  assert.equal(summary.error, null)
  assert.deepEqual(summary.tasks['i18n-generate'], task)
  for (const plugins of Object.values(summary.plugins)) {
    assert.ok(!plugins.some(name => /i18n-catalogs|paraglide/iu.test(name)))
  }
})

it('replaces the automatic plugin through extend in app and test targets', async context => {
  const root = await createRoot(context)
  for (const mode of ['development', 'production', 'test']) {
    const summary = await readSummary({
      options: { root, i18nPlugin: false },
      mode,
      hasReplacement: true
    })
    assert.equal(summary.error, null)
    assert.ok('i18n-generate' in summary.tasks)
    for (const [target, plugins] of Object.entries(summary.plugins)) {
      assert.ok(!plugins.some(name => /i18n-catalogs|paraglide/iu.test(name)))
      assert.equal(
        plugins.includes('custom-i18n'),
        target !== 'app' || mode !== 'test'
      )
    }
  }
})
