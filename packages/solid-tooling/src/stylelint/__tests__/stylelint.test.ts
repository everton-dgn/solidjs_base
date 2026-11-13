import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { execPath } from 'node:process'
import { it } from 'node:test'
import { promisify } from 'node:util'

import * as v from 'valibot'

import { createAppFixture } from '../../testing/appFixture/index.ts'

type Summary = v.InferOutput<typeof summarySchema>

const PRESET = new URL('../../../dist/stylelint.mjs', import.meta.url).href
const TOKENS = 'src/theme/tokens/colors.css'
const TOKEN_FILES = 'src/theme/tokens/**/*.css'
const ANIMATION = 'src/theme/class/animation.css'
const TOKENS_CSS = ':root {\n  --color-primary: currentcolor;\n}\n'
const ANIMATION_CSS = '@keyframes fade_in {\n  to {\n    opacity: 1;\n  }\n}\n'
const COMPONENT = 'src/components/atoms/Card/styles.module.css'
const exec = promisify(execFile)

const summarySchema = v.object({
  referenceFiles: v.array(v.string()),
  plugins: v.array(v.string()),
  report: v.string(),
  hasErrors: v.boolean()
})

// The child runs from the application root, which has no node_modules:
// Stylelint and its plugin can only come from the compiled package.
async function check(root: string): Promise<Summary> {
  const script = `
const { checkCss, defineStylelintConfig } = await import(${JSON.stringify(PRESET)})
const root = ${JSON.stringify(root)}
const { referenceFiles, plugins } = await defineStylelintConfig(root)
const { report, hasErrors } = await checkCss(root)
process.stdout.write(JSON.stringify({ referenceFiles, plugins, report, hasErrors }))
`
  const { stdout } = await exec(
    execPath,
    ['--input-type=module', '--eval', script],
    { cwd: root }
  )
  return v.parse(summarySchema, JSON.parse(stdout))
}

it('lints an application without theme files', async context => {
  const root = await createAppFixture({
    context,
    files: { [COMPONENT]: '.card {\n  display: block;\n}\n' }
  })
  const summary = await check(root)
  assert.deepEqual(summary.referenceFiles, [])
  assert.equal(summary.report, '')
  assert.equal(summary.hasErrors, false)
})

it('passes only the theme references that exist', async context => {
  const [tokensOnly, animationOnly, both] = await Promise.all([
    createAppFixture({
      context,
      files: {
        [TOKENS]: TOKENS_CSS,
        [COMPONENT]: '.card {\n  color: var(--color-primary);\n}\n'
      }
    }),
    createAppFixture({
      context,
      files: {
        [ANIMATION]: ANIMATION_CSS,
        [COMPONENT]: '.card {\n  animation: fade_in 1s;\n}\n'
      }
    }),
    createAppFixture({
      context,
      files: { [TOKENS]: TOKENS_CSS, [ANIMATION]: ANIMATION_CSS }
    })
  ])
  const summaries = await Promise.all(
    [tokensOnly, animationOnly, both].map(root => check(root))
  )
  assert.deepEqual(
    summaries.map(summary => summary.referenceFiles),
    [
      [path.join(tokensOnly, TOKEN_FILES)],
      [path.join(animationOnly, ANIMATION)],
      [path.join(both, TOKEN_FILES), path.join(both, ANIMATION)]
    ]
  )
  assert.deepEqual(
    summaries.map(summary => summary.hasErrors),
    [false, false, false]
  )
})

it('reports the policy, the nesting plugin and the file names', async context => {
  const root = await createAppFixture({
    context,
    files: {
      [TOKENS]: TOKENS_CSS,
      [COMPONENT]:
        '.badClass {\n  color: var(--color-primary);\n}\n\n.card {\n  color: var(--color-primary);\n}\n\n.card:hover {\n  color: var(--color-missing);\n}\n',
      'src/components/atoms/Card/card.module.css':
        '.card {\n  display: block;\n}\n'
    }
  })
  const summary = await check(root)
  assert.equal(summary.hasErrors, true)
  for (const expected of [
    'selector-class-pattern',
    'csstools/use-nesting',
    'no-unknown-custom-properties',
    'src/components/atoms/Card/card.module.css:1 error project/css-filename'
  ]) {
    assert.ok(summary.report.includes(expected), expected)
  }
  assert.ok(path.isAbsolute(summary.plugins[0] ?? ''))
})
