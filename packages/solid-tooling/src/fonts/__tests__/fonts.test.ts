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
  await assert.rejects(
    () => readFontAssets({ ...options, base: './' }),
    /same-origin absolute pathname/u
  )
})

it('registers no plugin when fonts are absent or empty', () => {
  assert.equal(fontsPlugin({ root: '/unused' }), undefined)
  assert.equal(fontsPlugin({ root: '/unused', fonts: [] }), undefined)
})
