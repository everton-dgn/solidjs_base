import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  readdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it } from 'node:test'

import { object, parse, record, string } from 'valibot'

import { generate } from '../src/generate.ts'

const repetitions = 15
for (const title of [
  String.raw`Été " ' < & \ \` #`,
  'Um título comprido '.repeat(repetitions).trim()
]) {
  void it(`escapes and formats a client application named ${title}`, async context => {
    const dir = mkdtempSync(path.join(tmpdir(), 'app-title-'))
    context.after(() => rmSync(dir, { recursive: true, force: true }))
    generate({
      dir,
      title,
      mode: 'client',
      pm: 'bun',
      shouldInstall: false,
      shouldInitGit: false
    })
    const module: unknown = await import(
      path.join(dir, 'src/constants/site/title.ts')
    )
    const siteSchema = object({ title: string() })
    const { SITE } = parse(object({ SITE: siteSchema }), module)
    assert.equal(SITE.title, title)
    const source = readFileSync(
      path.join(dir, 'src/routes/(base)/(home)/i18n/en.json'),
      'utf8'
    )
    const catalog = parse(record(string(), string()), JSON.parse(source))
    assert.equal(catalog.home_seoTitle, `${title} | Web applications`)
    assert.equal(catalog.home_title, `${title} for web applications`)
    const files = readdirSync(dir)
    copyFileSync(
      'dist/formatter/vite.config.mjs',
      path.join(dir, 'fmt.config.mjs')
    )
    execFileSync(
      path.resolve('../../node_modules/.bin/vp'),
      ['fmt', '--config', 'fmt.config.mjs', '--check', ...files],
      { cwd: dir }
    )
  })
}
