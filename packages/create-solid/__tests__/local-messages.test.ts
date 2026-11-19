import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it } from 'node:test'
import { pathToFileURL } from 'node:url'

import { configureMessages } from '../src/configureMessages/index.ts'

void it('compiles only base messages and distinguishes parameters from escaped titles', context => {
  const stage = mkdtempSync(path.join(tmpdir(), 'solid-messages-'))
  context.after(() => rmSync(stage, { recursive: true, force: true }))
  const settings = path.join(stage, 'project.inlang')
  mkdirSync(settings)
  writeFileSync(
    path.join(settings, 'settings.json'),
    JSON.stringify({
      baseLocale: 'pt',
      locales: ['en', 'pt']
    })
  )
  const folder = path.join(stage, 'src/home/i18n')
  mkdirSync(folder, { recursive: true })
  writeFileSync(path.join(folder, 'en.json'), '{"other":"unused"}')
  writeFileSync(
    path.join(folder, 'pt.json'),
    JSON.stringify({
      heading: String.raw`Título \\ \{x\}`,
      welcome: 'Olá, {name}! {name}, entre em {place}.'
    })
  )
  configureMessages({
    stage,
    write: ({ file, content }) => {
      writeFileSync(path.join(stage, file), content)
    }
  })
  const file = path.join(stage, 'src/constants/messages/index.ts')
  const script = `import { m } from ${JSON.stringify(pathToFileURL(file).href)}
console.log(JSON.stringify([Object.keys(m).toSorted(), m.heading(), m.welcome({ name: 'Lia', place: 'Casa' })]))`
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { encoding: 'utf8' }
  )
  assert.deepEqual(JSON.parse(output), [
    ['heading', 'welcome'],
    String.raw`Título \ {x}`,
    'Olá, Lia! Lia, entre em Casa.'
  ])
})
