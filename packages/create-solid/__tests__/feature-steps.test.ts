import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it, type TestContext } from 'node:test'

import { configureClient } from '../src/configureClient/index.ts'
import { configureFileHostGuides } from '../src/configureFileHostGuides/index.ts'
import { configureFonts } from '../src/configureFonts/index.ts'
import { configureTestLabels } from '../src/configureLocales/browser-labels.ts'
import { configurePlainGuide } from '../src/configureLocales/configure-plain-guide.ts'
import { configurePlainSource } from '../src/configurePlainApp/configure-plain-source.ts'
import { configureSeo } from '../src/configureSeo/index.ts'
import { configureStatic } from '../src/configureStatic/index.ts'
import { editTemplate } from '../src/edit-template.ts'
import { applyPreparedGuides } from '../src/prepared-guides.ts'
import { removeFeatureFiles } from '../src/removeFeatureFiles/index.ts'
import { removeSeoCopy } from '../src/removeSeoCopy/index.ts'
import { removeSeoTests } from '../src/removeSeoTests/index.ts'
import type { FileWrite, StagedContext } from '../src/types.ts'

function fixture(t: TestContext): StagedContext {
  const stage = mkdtempSync(path.join(tmpdir(), 'solid-feature-step-'))
  t.after(() => rmSync(stage, { recursive: true, force: true }))
  const write = ({ file, content }: FileWrite) => {
    const target = path.join(stage, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return {
    stage,
    write,
    profile: {
      dir: stage,
      pm: 'bun',
      mode: 'static',
      hasSeo: false,
      hasTheme: false,
      hasFonts: false,
      shouldInstall: false,
      shouldInitGit: false
    },
    pkg: { name: 'app', scripts: {}, devDependencies: {}, dependencies: {} },
    settings: {
      bunVersion: '1',
      catalog: {},
      versions: {},
      overrides: {},
      patches: {},
      bunfig: '',
      lefthook: '1'
    }
  }
}
void it('rejects a locale helper missing the language menu import', t => {
  const context = fixture(t)
  context.write({
    file: 'project.inlang/settings.json',
    content: JSON.stringify({ baseLocale: 'es', locales: ['es'] })
  })
  context.write({
    file: 'src/tests/helpers/scenarioLocales/index.ts',
    content: 'export {}\n'
  })
  assert.throws(() => configureTestLabels(context), /Missing template edit/u)
})

void it('rejects a changed SEO import before rewriting the app', t => {
  const context = fixture(t)
  context.write({
    file: 'vite.config.ts',
    content: readFileSync('../../apps/boilerplate/vite.config.ts', 'utf8')
  })
  context.write({
    file: 'src/App.tsx',
    content: 'export default function App() {}'
  })
  assert.throws(
    () => configureSeo(context),
    /Missing template edit in src\/App.tsx/u
  )
})
void it('rejects a missing catalog key in the SEO copy', t => {
  const context = fixture(t)
  context.write({
    file: 'project.inlang/settings.json',
    content: JSON.stringify({ baseLocale: 'en', locales: ['en'] })
  })
  context.write({
    file: 'src/routes/(base)/(home)/i18n/en.json',
    content: '{}'
  })
  assert.throws(
    () => removeSeoCopy(context.stage),
    /Missing catalog key .*home_features/u
  )
})
void it('preserves the translated missing page title in the reduced browser suite', () => {
  let result = "toHaveTitle('Página não encontrada')"
  removeSeoTests({
    isServer: true,
    edit(file, transform) {
      if (!file.endsWith('I18n.urlPattern.production.e2e.test.ts')) return
      result = transform(result, (input, edits) => {
        let output = input
        for (const [pattern, replacement] of edits) {
          output = editTemplate({ file, text: output, pattern, replacement })
        }
        return output
      })
    }
  })
  assert.equal(result, "toHaveTitle('Página não encontrada')")
})
void it('rejects a file host security guide with a missing section boundary', t => {
  const context = fixture(t)
  context.write({
    file: 'docs/security.md',
    content: '## Content policy\n\nExisting policy.'
  })
  assert.throws(
    () => configureFileHostGuides(context),
    /Missing template edit in docs\/security.md/u
  )
})
void it('requires the font configuration import when removing fonts', t => {
  const context = fixture(t)
  context.write({ file: 'vite.config.ts', content: 'export default {}' })
  assert.throws(
    () => configureFonts({ stage: context.stage, hasFonts: false }),
    /Missing template edit .*vite.config.ts/u
  )
})
void it('requires the static theme section in the UI guide', t => {
  const context = fixture(t)
  context.profile.hasTheme = true
  context.write({ file: 'docs/ui.md', content: '## Fonts\n' })
  assert.throws(
    () => configureStatic(context),
    /Missing template edit in docs\/ui.md/u
  )
})
void it('writes client entry files and keeps the file host preview independent', t => {
  const context = fixture(t)
  context.profile.mode = 'client'
  context.write({
    file: 'vite.config.ts',
    content:
      "export default defineSolidApp({\n  middleware: middleware,\n  output: 'static'\n})"
  })
  context.write({ file: 'tooling/testing/serve-public.ts', content: '' })
  context.write({
    file: 'playwright.config.ts',
    content: 'node tooling/testing/serve-public.ts'
  })
  context.write({
    file: 'tooling/knip.ts',
    content: "  root: '.',\n  ignore: ['server-only', 'test']"
  })
  configureClient(context)
  assert.match(
    readFileSync(path.join(context.stage, 'src/entry-client.tsx'), 'utf8'),
    /render\(\(\) => <App/u
  )
  assert.match(
    readFileSync(path.join(context.stage, 'index.html'), 'utf8'),
    /name="theme-color"/u
  )
  assert.equal(
    existsSync(path.join(context.stage, 'tooling/testing/serve-public.ts')),
    false
  )
})
void it('removes a shared guide when either required feature leaves', t => {
  const context = fixture(t)
  const file = 'docs/server-errors/ssr-integrity.md'
  for (const feature of ['server', 'seo']) {
    context.write({ file, content: 'SSR publication integrity' })
    removeFeatureFiles({ stage: context.stage, disabled: [feature] })
    assert.equal(existsSync(path.join(context.stage, file)), false)
  }
})

void it('requires the Vite configuration during SEO removal', t => {
  const context = fixture(t)
  assert.throws(() => configureSeo(context), /ENOENT.*vite.config.ts/u)
})
void it('rejects guide text outside the prepared digests', t => {
  const { stage, write } = fixture(t)
  write({ file: 'AGENTS.md', content: 'Changed convention' })
  write({ file: 'docs/changed.md', content: 'Unexpected guide' })
  write({ file: 'README.md', content: 'Unexpected heading' })
  assert.throws(
    () => applyPreparedGuides(stage),
    /Unprepared guide: AGENTS.md/u
  )
})

void it('rejects extra or missing global anchors in the theme conventions', () => {
  const edit = {
    file: 'template/AGENTS.md',
    pattern: /\bTheme\b/gu,
    replacement: 'Preference'
  }
  assert.equal(
    editTemplate({ ...edit, text: 'Theme or Theme' }),
    'Preference or Preference'
  )
  for (const text of ['Theme', 'Theme or Theme or Theme']) {
    assert.throws(() => editTemplate({ ...edit, text }), /expected 2 matches/u)
  }
})

void it('rejects a missing plain router edit at its source file', t => {
  const { profile } = fixture(t)
  const file = 'src/router.ts'
  const text = "import { delocalizePathname } from './locale.ts'\n"
  assert.throws(
    () => configurePlainSource({ profile, file, text }),
    /Missing template edit in src\/router\.ts:.*transformUrl/u
  )
})

void it('requires each occurrence owned by a plain language guide', t => {
  const { profile } = fixture(t)
  const file = 'docs/seo.md'
  assert.throws(
    () =>
      configurePlainGuide({ profile, file, text: '@paraglide/messages.js' }),
    /docs\/seo\.md: expected 2 matches of @paraglide\/messages\.js, found 1/u
  )
})
