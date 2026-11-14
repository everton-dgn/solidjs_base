/* oxlint-disable node/no-sync -- Each call inspects or mutates only the owned temporary scenario. */
import assert from 'node:assert/strict'
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { stdout } from 'node:process'

import { FONT_FIXTURE } from './font-fixture.ts'

type Target = { app: string; scenario: string }
type Preparation = Target & { root: string }
type Mutation = Target & { mutation: string | undefined }
type HtmlTarget = Target & { html: string }
type Link = Record<string, string | undefined>
const FONT_MODULE = /solid-runtime\/src\/fonts\/|solid-app:fonts/u

function linkAttributes(tag: string): Link {
  const attributes: Link = {}
  for (const match of tag.matchAll(/(?<key>[\w-]+)="(?<value>[^"]*)"/gu)) {
    const key = match.groups?.key
    assert.ok(key)
    attributes[key] = match.groups?.value
  }
  return attributes
}

function outputRoot({ app, scenario }: Target): string {
  return path.join(
    app,
    scenario === 'client-only' ? 'dist' : '.vercel/output/static'
  )
}

function styles(target: Target): string {
  const directory = outputRoot(target)
  return readdirSync(directory, { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.css'))
    .map(file => readFileSync(path.join(directory, String(file)), 'utf8'))
    .join('\n')
}

export function prepareFontsScenario({
  app,
  scenario,
  root
}: Preparation): void {
  cpSync(path.join(root, 'fixtures/apps', scenario), app, { recursive: true })
  if (scenario === 'ssr-i18n') return
  const directory = path.join(app, 'src/assets')
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, 'scenario.woff2'), FONT_FIXTURE)
}

export function mutateFontsScenario({
  app,
  scenario,
  mutation
}: Mutation): void {
  if (mutation === 'fonts-import') {
    assert.equal(scenario, 'ssr-i18n')
    const file = path.join(app, 'src/App.tsx')
    writeFileSync(
      file,
      `import { FontLinks } from '@evertondgn/solid-runtime/fonts/font-links'\n${readFileSync(file, 'utf8').replace('<head>', '<head><FontLinks />')}`
    )
    const audit = path.join(app, 'scenario-audit.ts')
    writeFileSync(
      audit,
      readFileSync(audit, 'utf8').replace(
        "name: 'scenario-audit',",
        `name: 'scenario-audit',
      resolveId(id) { if (id === 'virtual:solid-app/fonts') return '\\0solid-app:fonts-unexpected' },
      load(id) { if (id === '\\0solid-app:fonts-unexpected') return 'export const stylesheet = "/assets/unexpected.css"; export const preloads = []' },`
      )
    )
  }
  if (mutation !== 'fonts-href' && mutation !== 'fonts-inline') return
  assert.equal(scenario, 'ssr-plain')
  const file = path.join(
    app,
    'node_modules/@evertondgn/solid-runtime/src/fonts/FontLinks/index.tsx'
  )
  const source = readFileSync(file, 'utf8')
  const changed =
    mutation === 'fonts-href'
      ? source.replace('href={font.href}', 'href="/assets/wrong.woff2"')
      : source.replace(
          '<link rel="stylesheet" href={stylesheet} />',
          '<style>{"@font-face { font-family: Scenario; src: url(/assets/wrong.woff2); }"}</style>'
        )
  assert.notEqual(
    changed,
    source,
    'Font mutation must change the installed runtime'
  )
  writeFileSync(file, changed)
}

export function assertFontHtml({ app, scenario, html }: HtmlTarget): void {
  assert.doesNotMatch(
    html,
    /<style\b|\sstyle\s*=/iu,
    'Font HTML must not contain inline styles'
  )
  const links = [...html.matchAll(/<link\b[^>]*>/giu)].map(([tag]) =>
    linkAttributes(tag)
  )
  const preloads = links.filter(
    link => link.rel === 'preload' && link.as === 'font'
  )
  if (scenario === 'ssr-i18n') {
    assert.equal(preloads.length, 0, 'Disabled fonts must not preload a font')
    return
  }
  const css = styles({ app, scenario })
  const urls = [...css.matchAll(/url\("(?<url>[^"]+\.woff2)"\)/gu)].map(
    match => match.groups?.url
  )
  assert.equal(preloads.length, 1, 'Exactly one configured font preload')
  const [preload] = preloads
  assert.ok(preload)
  assert.equal(
    preload.href,
    urls[0],
    'Font preload href must equal the emitted CSS URL including its hash'
  )
  assert.equal(preload.crossorigin, 'anonymous')
  assert.equal(preload.type, 'font/woff2')
  const stylesheet = links.find(
    link => link.rel === 'stylesheet' && link.href?.includes('/solid-fonts-')
  )
  assert.ok(
    stylesheet?.href,
    'Font CSS must load through an external stylesheet link'
  )
  const directory = outputRoot({ app, scenario })
  const linkedCss = readFileSync(path.join(directory, stylesheet.href), 'utf8')
  assert.equal(linkedCss, `${css.trimEnd()}\n`)
  stdout.write(
    `${scenario}: external CSS and preload share ${preload.href}; no inline style\n`
  )
}

export function assertFontBuild(target: Target): void {
  const { app, scenario } = target
  const directory = outputRoot(target)
  const output = readdirSync(directory, { recursive: true }).map(String)
  const fonts = output.filter(file => /\.(?:woff2?|ttf|otf)$/u.test(file))
  const css = styles(target)
  if (scenario === 'ssr-i18n') {
    assert.equal(fonts.length, 0, 'Disabled fonts must emit no font asset')
    assert.doesNotMatch(
      css,
      /@font-face/u,
      'Disabled fonts must emit no font-face CSS'
    )
    assert.ok(!output.some(file => file.includes('solid-fonts-')))
    for (const file of readdirSync(app).filter(name =>
      name.startsWith('scenario-modules-')
    )) {
      assert.doesNotMatch(
        readFileSync(path.join(app, file), 'utf8'),
        FONT_MODULE,
        'Disabled fonts bundled a font module'
      )
    }
    return
  }
  assert.equal(fonts.length, 1, 'Each font must be emitted exactly once')
  assert.match(fonts[0] ?? '', /-[a-f\d]{16}\.woff2$/u)
  assert.deepEqual(
    readFileSync(path.join(directory, fonts[0] ?? '')),
    FONT_FIXTURE
  )
  assert.equal(css.match(/@font-face/gu)?.length, 1)
  for (const declaration of [
    'font-family: "Scenario Font"',
    'font-weight: 400',
    'font-style: normal',
    'font-display: swap',
    'unicode-range: U+0041'
  ]) {
    assert.ok(
      css.includes(declaration),
      `Emitted CSS must preserve ${declaration}`
    )
  }
  assert.doesNotMatch(css, /data:/u, 'Even small fonts must not be inlined')
  if (scenario === 'client-only') {
    assertFontHtml({
      ...target,
      html: readFileSync(path.join(directory, 'index.html'), 'utf8')
    })
  }
}
