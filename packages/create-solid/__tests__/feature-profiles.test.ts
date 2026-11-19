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
  String.raw`Été " ' < & {x} \\ \` # ~~x~~`,
  'Um título comprido '.repeat(repetitions).trim()
]) {
  void it(`escapes and formats a client application named ${title}`, async context => {
    const dir = mkdtempSync(path.join(tmpdir(), 'app-title-'))
    context.after(() => rmSync(dir, { recursive: true, force: true }))
    generate({
      dir,
      title: `  ${title.replaceAll(' ', '  ')}  `,
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
    for (const [key, expected] of [
      ['home_seoTitle', `${title} | Web applications`],
      ['home_title', `${title} for web applications`]
    ] as const) {
      const pattern = catalog[key]
      assert.ok(pattern)
      assert.match(pattern, /^(?:[^\\{}]|\\[\\{}])*$/u)
      assert.equal(
        pattern.replaceAll(/\\(?<escaped>[\\{}])/gu, '$<escaped>'),
        expected
      )
    }
    const html = readFileSync(path.join(dir, 'index.html'), 'utf8')
    const [heading] = readFileSync(path.join(dir, 'README.md'), 'utf8').split(
      '\n'
    )
    assert.ok(heading)
    for (const value of [
      /<title>(?<title>[^<]*)<\/title>/u.exec(html)?.groups?.title,
      heading.slice('# '.length)
    ]) {
      assert.ok(value)
      const decoded = value
        .trim()
        .replaceAll(/\s+/gu, ' ')
        .replaceAll(/&#(?<digits>\d+);/gu, (_, digits: string) =>
          String.fromCodePoint(Number(digits))
        )
        .replaceAll('&gt;', '>')
        .replaceAll('&lt;', '<')
        .replaceAll('&amp;', '&')
      assert.equal(decoded, title)
    }
    assert.ok(!html.includes('&#32;'))
    assert.ok(!heading.includes('~~'))
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
