import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { it, type TestContext } from 'node:test'

import { build, createServer } from 'vite-plus'

import { FONT_FIXTURE } from '../../tarball/font-fixture.ts'
import { readFontAssets } from '../assets.ts'
import { fontsPlugin } from '../index.ts'
import type { FontOptions } from '../types.ts'

const EXPECTED_ASSETS = 2
const REQUEST_TIMEOUT = 5000

async function fixture(context: TestContext): Promise<FontOptions> {
  const root = await mkdtemp(path.join(tmpdir(), 'solid-fonts-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'small.woff2'), FONT_FIXTURE)
  await writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><html><head><title>Fonts</title></head><body>A</body></html>'
  )
  return {
    root,
    ssr: false,
    fonts: [
      {
        family: 'Example',
        files: [
          {
            path: 'small.woff2',
            weight: '100 900',
            unicodeRange: 'U+0041',
            preload: true
          }
        ]
      }
    ]
  }
}

it('emits a tiny font once and shares its exact URL between CSS and preloads', async context => {
  const options = await fixture(context)
  const result = await readFontAssets({
    ...options,
    base: '/app/',
    assetsDir: 'static'
  })
  assert.equal(result.assets.length, EXPECTED_ASSETS)
  assert.equal(result.preloads.length, 1)
  assert.ok(result.preloads[0]?.href.startsWith('/app/static/small-'))
  const css = String(result.assets.at(-1)?.source)
  assert.ok(css.includes(`url("${result.preloads[0]?.href}")`))
  assert.match(css, /font-display: swap/u)
  assert.doesNotMatch(css, /data:/u)
  await build({
    configFile: false,
    root: options.root,
    base: '/app/',
    plugins: [fontsPlugin(options)],
    build: { assetsDir: 'static' },
    logLevel: 'silent'
  })
  const html = await readFile(
    path.join(options.root, 'dist/index.html'),
    'utf8'
  )
  assert.ok(html.includes(result.stylesheet))
  assert.ok(html.includes(result.preloads[0]?.href ?? 'missing'))
  assert.doesNotMatch(html, /<style\b/iu)
})

it('deduplicates bytes across files and preloads without merging face descriptors', async context => {
  const options = await fixture(context)
  await writeFile(path.join(options.root, 'copy.woff2'), FONT_FIXTURE)
  const result = await readFontAssets({
    ...options,
    base: '/',
    assetsDir: 'assets',
    fonts: [
      {
        family: 'Example',
        files: [
          { path: 'small.woff2', preload: true },
          {
            path: 'copy.woff2',
            style: 'italic',
            display: 'optional',
            preload: true
          }
        ]
      }
    ]
  })
  assert.equal(result.assets.length, EXPECTED_ASSETS)
  assert.equal(result.preloads.length, 1)
  const css = String(result.assets.at(-1)?.source)
  assert.equal(css.match(/@font-face/gu)?.length, EXPECTED_ASSETS)
  assert.match(css, /font-style: italic/u)
  assert.match(css, /font-display: optional/u)
})

it('changes both the font URL and CSS hash when the source bytes change', async context => {
  const options = {
    ...(await fixture(context)),
    base: '/',
    assetsDir: 'assets'
  }
  const before = await readFontAssets(options)
  await writeFile(
    path.join(options.root, 'small.woff2'),
    Buffer.concat([FONT_FIXTURE, Buffer.from('changed')])
  )
  const after = await readFontAssets(options)
  assert.notEqual(before.preloads[0]?.href, after.preloads[0]?.href)
  assert.notEqual(before.stylesheet, after.stylesheet)
})

it('serves external CSS and the same font URL in development', async context => {
  const options = await fixture(context)
  const server = await createServer({
    configFile: false,
    root: options.root,
    plugins: [fontsPlugin(options)],
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent'
  })
  try {
    await server.listen()
    const origin = server.resolvedUrls?.local[0]
    assert.ok(origin)
    const result = await readFontAssets({
      ...options,
      base: '/',
      assetsDir: 'assets'
    })
    const css = await fetch(new URL(result.stylesheet, origin), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })
    assert.equal(css.headers.get('content-type'), 'text/css')
    const stylesheet = await css.text()
    assert.ok(stylesheet.includes(result.preloads[0]?.href ?? 'missing'))
    const font = await fetch(new URL(result.preloads[0]?.href ?? '', origin), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })
    assert.equal(font.headers.get('content-type'), 'font/woff2')
    assert.deepEqual(Buffer.from(await font.arrayBuffer()), FONT_FIXTURE)
  } finally {
    // Stop the watcher before the fixture's cleanup removes its source files.
    await server.close()
  }
})

it('rejects executable or injectable descriptors and files outside the root', async context => {
  const options = {
    ...(await fixture(context)),
    base: '/',
    assetsDir: 'assets'
  }
  for (const extra of [
    { weight: '400; color:red' },
    { unicodeRange: 'U+0041;}' },
    { display: () => 'swap' }
  ]) {
    await assert.rejects(() =>
      readFontAssets({
        ...options,
        fonts: [
          {
            family: 'Example',
            // @ts-expect-error JavaScript configurations must reject executable descriptors.
            files: [{ path: 'small.woff2', ...extra }]
          }
        ]
      })
    )
  }
  await assert.rejects(
    () =>
      readFontAssets({
        ...options,
        fonts: [{ family: 'Example', files: [{ path: '/tmp/font.woff2' }] }]
      }),
    /relative to the application root/u
  )
  const outside = await fixture(context)
  await symlink(
    path.join(outside.root, 'small.woff2'),
    path.join(options.root, 'outside.woff2')
  )
  await assert.rejects(
    () =>
      readFontAssets({
        ...options,
        fonts: [{ family: 'Example', files: [{ path: 'outside.woff2' }] }]
      }),
    /inside the application root/u
  )
  for (const base of ['//cdn.example/', 'https://cdn.example/', '/app/?v=1']) {
    await assert.rejects(
      () => readFontAssets({ ...options, base }),
      /same-origin absolute pathname/u
    )
  }
  for (const ssr of [true, undefined]) {
    await assert.rejects(
      () => readFontAssets({ ...options, ssr, base: './' }),
      /a relative base needs ssr: false/u
    )
  }
})

it('resolves the relative URLs of a client-only build to the same font', async context => {
  const options = await fixture(context)
  await build({
    configFile: false,
    root: options.root,
    base: './',
    plugins: [fontsPlugin(options)],
    logLevel: 'silent'
  })
  const html = await readFile(
    path.join(options.root, 'dist/index.html'),
    'utf8'
  )
  const stylesheet =
    /href="(?<href>\.\/assets\/solid-fonts-[\da-f]+\.css)"/u.exec(html)?.groups
      ?.href
  const preload = /rel="preload" href="(?<href>[^"]+)"/u.exec(html)?.groups
    ?.href
  assert.ok(stylesheet, html)
  assert.ok(preload, html)
  assert.ok(preload.startsWith('./assets/small-'), preload)
  const css = await readFile(
    path.join(options.root, 'dist', stylesheet),
    'utf8'
  )
  const font = /url\("(?<url>[^"]+)"\)/u.exec(css)?.groups?.url
  assert.ok(font, css)
  assert.match(font, /^small-[\da-f]+\.woff2$/u)
  const document = new URL('file:///shell/dist/index.html')
  const fromCss = new URL(font, new URL(stylesheet, document))
  assert.equal(fromCss.href, new URL(preload, document).href)
  const emitted = await readFile(
    path.join(
      options.root,
      'dist',
      path.posix.relative('/shell/dist', fromCss.pathname)
    )
  )
  assert.deepEqual(emitted, FONT_FIXTURE)
})

// Names with dots, a backslash, a space and non-ASCII letters.
const UNUSUAL_FONTS = [
  'my font..ção.woff2',
  String.raw`back\slash.woff2`,
  'a..b.woff2'
]
const OUTPUT = 'file:///shell/dist/'
const LEGITIMATE_ASSETS_DIRS = [
  'assets',
  'a/b',
  './static',
  'my assets',
  'ç',
  '',
  '.well-known',
  'v1.2/assets',
  'a..b',
  'my.assets',
  '...'
]
// WHY: a URL keeps U+FF0E as %EF%BC%8E, which no host decodes into a dot.
const LITERAL_ASSETS_DIRS = ['\uFF0E\uFF0E', 'a/\uFF0E\uFF0E/b']

function assertInside(url: URL, label: string): void {
  assert.ok(
    url.href.startsWith(OUTPUT),
    `${label} left the output: ${url.href}`
  )
}

async function unusualOptions(context: TestContext): Promise<FontOptions> {
  const options = await fixture(context)
  // Different bytes, so each file becomes an asset of its own.
  for (const [index, name] of UNUSUAL_FONTS.entries()) {
    await writeFile(
      path.join(options.root, name),
      Buffer.concat([FONT_FIXTURE, Buffer.from([index])])
    )
  }
  return {
    ...options,
    fonts: [
      {
        family: 'Example',
        files: UNUSUAL_FONTS.map(name => ({ path: name, preload: true }))
      }
    ]
  }
}

it('keeps relative font URLs inside the output for unusual names', async context => {
  const options = await unusualOptions(context)
  const document = new URL('index.html', OUTPUT)
  for (const assetsDir of [...LEGITIMATE_ASSETS_DIRS, ...LITERAL_ASSETS_DIRS]) {
    const result = await readFontAssets({ ...options, base: './', assetsDir })
    for (const asset of result.assets) {
      assertInside(new URL(asset.fileName, OUTPUT), asset.fileName)
    }
    const stylesheet = new URL(result.stylesheet, document)
    assertInside(stylesheet, result.stylesheet)
    const css = String(result.assets.at(-1)?.source)
    const urls = [...css.matchAll(/url\("(?<url>[^"]*)"\)/gu)].map(
      match => match.groups?.url ?? ''
    )
    assert.equal(urls.length, UNUSUAL_FONTS.length, css)
    assert.equal(css.match(/@font-face \{/gu)?.length, UNUSUAL_FONTS.length)
    for (const url of urls) assert.match(url, /^[\w-]+-[\da-f]+\.woff2$/u)
    const fromCss = urls.map(url => new URL(url, stylesheet).href)
    const fromHtml = result.preloads.map(({ href }) => {
      const resolved = new URL(href, document)
      assertInside(resolved, href)
      return resolved.href
    })
    assert.deepEqual(fromCss.toSorted(), fromHtml.toSorted(), assetsDir)
  }
  for (const assetsDir of [
    '..',
    '../x',
    'a/../..',
    String.raw`..\x`,
    String.raw`a\..\..`,
    '/abs',
    '%2e%2e',
    '%2E%2E',
    'a/%2E%2e/b',
    '.%2e',
    '.%2E',
    '%2e.',
    '%2E.',
    '.\t.',
    '.\n.',
    'a/.\r./..',
    // A host decodes these once into a parent.
    '..%2fx',
    '%2e%2e%2Fx',
    '..%5cx',
    '%2E%2E%5Cx',
    '%252e%252e',
    'a/%252E%252e/b'
  ]) {
    for (const base of ['./', '/app/']) {
      await assert.rejects(
        () => readFontAssets({ ...options, base, assetsDir }),
        /assetsDir must stay inside the client output/u,
        `${base} ${assetsDir}`
      )
    }
  }
})

it('keeps the fonts of an absolute base under it for literal folder names', async context => {
  const options = await unusualOptions(context)
  const page = 'https://example.test/app/index.html'
  for (const assetsDir of [...LEGITIMATE_ASSETS_DIRS, ...LITERAL_ASSETS_DIRS]) {
    const result = await readFontAssets({
      ...options,
      base: '/app/',
      assetsDir
    })
    const hrefs = [
      result.stylesheet,
      ...result.preloads.map(({ href }) => href)
    ]
    for (const href of hrefs) {
      const url = new URL(href, page)
      assert.ok(url.pathname.startsWith('/app/'), `${assetsDir}: ${url.href}`)
    }
  }
})

it('builds relative font links that name the emitted files', async context => {
  const options = await unusualOptions(context)
  const assetsDir = 'my assets/ç'
  await build({
    configFile: false,
    root: options.root,
    base: './',
    plugins: [fontsPlugin(options)],
    build: { assetsDir },
    logLevel: 'silent'
  })
  const dist = path.join(options.root, 'dist')
  const html = await readFile(path.join(dist, 'index.html'), 'utf8')
  const document = new URL('index.html', OUTPUT)
  const outputPath = new URL(OUTPUT).pathname
  const onDisk = (url: URL): Promise<Buffer> => {
    const relative = decodeURIComponent(url.pathname.slice(outputPath.length))
    return readFile(path.join(dist, relative))
  }
  const preloads = [...html.matchAll(/rel="preload" href="(?<href>[^"]+)"/gu)]
  assert.equal(preloads.length, UNUSUAL_FONTS.length, html)
  const stylesheet = /href="(?<href>[^"]+\.css)"/u.exec(html)?.groups?.href
  assert.ok(stylesheet, html)
  const sheet = new URL(stylesheet, document)
  assertInside(sheet, stylesheet)
  const css = String(await onDisk(sheet))
  for (const match of css.matchAll(/url\("(?<url>[^"]*)"\)/gu)) {
    const font = new URL(match.groups?.url ?? '', sheet)
    assertInside(font, font.href)
    const bytes = await onDisk(font)
    assert.equal(bytes.length, FONT_FIXTURE.length + 1)
  }
  for (const match of preloads) {
    const font = new URL(match.groups?.href ?? '', document)
    assertInside(font, font.href)
    const bytes = await onDisk(font)
    assert.equal(bytes.length, FONT_FIXTURE.length + 1)
  }
})

it('registers no plugin when fonts are absent or empty', () => {
  assert.equal(fontsPlugin({ root: '/unused' }), undefined)
  assert.equal(fontsPlugin({ root: '/unused', fonts: [] }), undefined)
})
