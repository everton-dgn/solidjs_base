import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import { generate } from '../src/generate.ts'

for (const locales of [['fr', 'ja'], ['zh-Hant-TW']]) {
  void it(`generates browser expectations for ${locales.join(', ')}`, t => {
    const sandbox = mkdtempSync(path.join(tmpdir(), 'browser-locale-cases-'))
    t.after(() => rmSync(sandbox, { recursive: true, force: true }))
    const dir = path.join(sandbox, 'app')
    generate({
      dir,
      pm: 'bun',
      mode: 'server',
      locales,
      baseLocale: locales.at(-1),
      shouldInitGit: false,
      shouldInstall: false
    })
    const read = (file: string) =>
      readFileSync(path.join(dir, 'src/tests', file), 'utf8')
    const source = read('pages/I18n/I18n.production.e2e.test.ts')
    assert.match(source, /testLanguages\.locales\.map/u)
    assert.doesNotMatch(
      source,
      /\/pt\/404|'Español'|'Select language'|locale=es|es-AR/u
    )
    assert.equal(
      source.includes('switches language by keyboard'),
      locales.length > 1
    )
    const helper = read('helpers/testLanguages/index.ts')
    assert.match(helper, /m\.errorFallback_notFoundTitle/u)
    const urlPattern = read('pages/I18n/I18n.urlPattern.production.e2e.test.ts')
    assert.equal(urlPattern.includes('menuitemradio'), locales.length > 1)
    const markdown = read('pages/Markdown/Markdown.streaming.e2e.test.ts')
    assert.doesNotMatch(markdown, /(?:first|second):(?:en|pt|es):resolved/u)
    assert.equal(
      helper.includes('LocaleSwitcher/constants.ts'),
      locales.length > 1
    )
  })
}
