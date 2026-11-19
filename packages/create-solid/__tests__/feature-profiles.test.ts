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

import messageFormat from '@inlang/plugin-message-format'
import { array, object, parse, record, string } from 'valibot'

import { generate } from '../src/generate.ts'

const localeSettings = object({ locales: array(string()) })
const repetitions = 15
type AppTitleCase = {
  dir: string
  mode: 'server' | 'static' | 'client'
  title: string
}
async function checkTitleMessages({
  dir,
  mode,
  title
}: AppTitleCase): Promise<void> {
  const settingsSource = readFileSync(
    path.join(dir, 'project.inlang/settings.json'),
    'utf8'
  )
  const { locales } = parse(localeSettings, JSON.parse(settingsSource))
  const folders = {
    'routes/(base)/(home)': ['home_title', 'home_seoTitle'],
    'routes/(base)/about': ['about_title', 'about_pageTitle', 'about_intro'],
    'routes/(base)/contact': [
      'contact_pageTitle',
      'contact_intro',
      ...(mode === 'client' ? [] : ['contact_description'])
    ],
    'routes/(base)/privacy': ['privacy_pageTitle', 'privacy_intro'],
    'routes/(base)/[...404]': ['notFound_title'],
    'components/organisms/ErrorFallback': ['errorFallback_runtimePageTitle'],
    'constants/site': mode === 'client' ? [] : ['site_imageAlt']
  }
  for (const locale of locales) {
    for (const [folder, keys] of Object.entries(folders)) {
      if (keys.length === 0) continue
      const source = readFileSync(
        path.join(dir, 'src', folder, 'i18n', `${locale}.json`),
        'utf8'
      )
      const catalog = parse(record(string(), string()), JSON.parse(source))
      for (const key of keys) {
        const pattern = catalog[key]
        assert.ok(pattern, `${locale}: ${key}`)
        assert.ok(messageFormat.importFiles)
        const { variants } = await messageFormat.importFiles({
          settings: { baseLocale: locale, locales },
          files: [
            {
              locale,
              content: new TextEncoder().encode(
                JSON.stringify({ [key]: pattern })
              )
            }
          ]
        })
        assert.equal(variants.length, 1)
        const nodes = variants[0]?.pattern
        assert.equal(nodes?.length, 1)
        const [node] = nodes
        assert.ok(node?.type === 'text')
        const decoded = node.value
        if (key === 'site_imageAlt') {
          assert.ok(decoded.includes('SolidJS Boilerplate'))
        }
        if (['privacy_intro', 'contact_intro', 'site_imageAlt'].includes(key)) {
          assert.ok(!decoded.includes(title))
          continue
        }
        assert.ok(decoded.includes(title), `${locale}: ${key}`)
        if (key === 'home_title' || key === 'home_seoTitle') {
          assert.equal(decoded, title)
        }
        if (key === 'about_pageTitle') {
          assert.ok(decoded.endsWith(` | ${title}`))
        }
        if (key === 'about_title' && locale === 'pt') {
          assert.equal(decoded, `Sobre ${title}`)
        }
      }
    }
  }
}

for (const mode of ['server', 'static', 'client'] as const) {
  for (const title of [
    String.raw`Été " ' < & {x} \\ \` # ~~x~~`,
    'Um título comprido '.repeat(repetitions).trim()
  ]) {
    void it(`escapes and formats a ${mode} application named ${title}`, async context => {
      const dir = mkdtempSync(path.join(tmpdir(), 'app-title-'))
      context.after(() => rmSync(dir, { recursive: true, force: true }))
      generate({
        dir,
        title: `  ${title.replaceAll(' ', '  ')}  `,
        mode,
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
      await checkTitleMessages({ dir, mode, title })
      const values = []
      if (mode === 'client') {
        const html = readFileSync(path.join(dir, 'index.html'), 'utf8')
        assert.ok(!html.includes('&#32;'))
        values.push(
          /<title>(?<title>[^<]*)<\/title>/u.exec(html)?.groups?.title
        )
        for (const page of ['about', 'contact', 'privacy']) {
          const route = readFileSync(
            path.join(dir, `src/routes/(base)/${page}/index.tsx`),
            'utf8'
          )
          assert.ok(route.includes(`children: m.${page}_pageTitle()`))
        }
      }
      const readme = readFileSync(path.join(dir, 'README.md'), 'utf8')
      const [heading] = readme.split('\n')
      const checklist = readme
        .split('## Before publishing\n')[1]
        ?.split('\n## ')[0]
      assert.ok(checklist)
      for (const field of [
        'VITE_SITE_URL',
        'public/images/og.png',
        'site_imageAlt',
        'site_description',
        'llms.txt'
      ]) {
        assert.equal(checklist.includes(field), mode !== 'client')
      }
      assert.match(checklist, /^- Rewrite the home page texts/mu)
      assert.match(
        checklist,
        /^- To rename the app, update .*title\.ts.*page messages\.$/mu
      )
      assert.ok(!readme.includes('# About SolidJS Boilerplate'))
      assert.ok(heading)
      values.push(heading.slice('# '.length))
      for (const value of values) {
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
}
