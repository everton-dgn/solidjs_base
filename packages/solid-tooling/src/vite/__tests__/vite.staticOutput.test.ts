import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from 'node:process'
import { it, type TestContext } from 'node:test'

import type { PrerenderRoute } from 'nitro/types'

import { staticBuildPlugin, staticOutput } from '../static-output.ts'

const HTTP_NOT_FOUND = 404
const HTTP_SERVER_ERROR = 500

async function fixture(t: TestContext, page = 'about') {
  const root = await mkdtemp(path.join(tmpdir(), 'static-route-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = path.join(root, 'src/routes', page)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'index.tsx'), 'export default () => null')
  const config = await staticOutput({
    options: { root, output: 'static' },
    locales: []
  })
  assert.ok(config.hooks)
  return { hooks: config.hooks, prerender: config.prerender }
}

it('publishes the root catch-all response at /404.html', async t => {
  const config = await fixture(t, '(base)/[...404]')
  assert.ok(config.prerender.routes.includes('/404.html'))
  const route: PrerenderRoute = {
    route: '/404.html',
    contentType: 'text/html',
    error: Object.assign(new Error('Not found'), { status: HTTP_NOT_FOUND })
  }
  config.hooks['prerender:generate'](route)
  assert.equal(route.error, undefined)
  assert.equal(route.fileName, '/404.html')
})

it('fails when Nitro omits an expected page', async t => {
  const config = await fixture(t)
  assert.throws(
    () =>
      config.hooks['prerender:done']({
        failedRoutes: [],
        prerenderedRoutes: []
      }),
    /not published/u
  )
})

it('accepts HTML metadata containing a literal nonce example', async t => {
  const config = await fixture(t)
  const route: PrerenderRoute = {
    route: '/about',
    contentType: 'text/html',
    contents: '<meta property="og:title" content="Using nonce= in CSP">'
  }
  config.hooks['prerender:generate'](route)
  assert.equal(route.error, undefined)
})

it('writes per-file inline script hashes and their union outside public', async t => {
  const config = await fixture(t)
  const dir = await mkdtemp(path.join(tmpdir(), 'static-csp-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const publicDir = path.join(dir, 'public')
  await mkdir(publicDir)
  await writeFile(
    path.join(publicDir, 'index.html'),
    '<script>abc</script><script src="/entry.js"></script>'
  )
  await writeFile(
    path.join(publicDir, '404.html'),
    '<script>abc</script><script type="module">hello</script><script type="application/json">{}</script>'
  )
  const output = { dir, publicDir }
  await config.hooks.compiled({ options: { static: false, output } })
  await assert.rejects(readFile(path.join(dir, 'csp-hashes.json')), {
    code: 'ENOENT'
  })
  await config.hooks.compiled({ options: { static: true, output } })
  const hash = 'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='
  const moduleHash = 'sha256-LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ='
  const manifest = await readFile(path.join(dir, 'csp-hashes.json'), 'utf8')
  assert.deepEqual(JSON.parse(manifest), {
    pages: { '/index.html': [hash], '/404.html': [moduleHash, hash] },
    union: [moduleHash, hash]
  })
})

it('retains the original failure and refuses parameterized pages and nested catch-alls', async t => {
  for (const page of ['articles/[id]', 'nested/[...rest]']) {
    const config = await fixture(t, page)
    assert.throws(
      () =>
        config.hooks['prerender:done']({
          failedRoutes: [],
          prerenderedRoutes: []
        }),
      /cannot enumerate pages/u
    )
    assert.doesNotThrow(() =>
      config.hooks['prerender:done']({
        failedRoutes: [{ route: '/' }],
        prerenderedRoutes: []
      })
    )
  }
})

it('refuses non-HTML pages and nonce attributes', async t => {
  const config = await fixture(t)
  for (const [contentType, contents, expected] of [
    ['text/plain', 'hello', /expected HTML/u],
    ['text/html', '<script nonce="x"></script>', /cannot publish a CSP nonce/u]
  ] as const) {
    const route: PrerenderRoute = { route: '/about', contentType, contents }
    config.hooks['prerender:generate'](route)
    assert.match(route.error?.message ?? '', expected)
  }
})

it('refuses server operations on static routes', async t => {
  for (const method of [
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS'
  ]) {
    const root = await mkdtemp(path.join(tmpdir(), 'static-operation-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const dir = path.join(root, 'src/routes/api')
    await mkdir(dir, { recursive: true })
    await writeFile(
      path.join(dir, 'index.ts'),
      `export const ${method} = () => new Response()`
    )
    await assert.rejects(
      staticOutput({ options: { output: 'static', root }, locales: [] }),
      /cannot publish the server operation/u
    )
  }
})

it('refuses a publication endpoint without its SEO feature', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'static-robots-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = path.join(root, 'src/routes/sitemap.xml')
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'index.ts'),
    'export const GET = () => new Response()'
  )
  await assert.rejects(
    staticOutput({ options: { output: 'static', root }, locales: [] }),
    /requires seo.sitemap/u
  )
})

it('wraps the chosen middleware and refuses a nonempty server function manifest', () => {
  const root = import.meta.dirname
  const entry = path.join(root, 'middleware.ts')
  for (const middleware of ['middleware.ts', undefined]) {
    const plugin = staticBuildPlugin({ root, middleware })
    const { resolveId, load, transform } = plugin
    assert.ok(
      typeof resolveId === 'function' &&
        typeof load === 'function' &&
        typeof transform === 'function'
    )
    const resolve = (id: string, importer: string): unknown =>
      Reflect.apply(resolveId, {}, [id, importer, {}])
    const target = middleware ? entry : path.join(root, 'package.json')
    const wrapper = resolve(target, 'virtual:solid-ssr-handler')
    assert.equal(wrapper, '\0solid-app:static-middleware')
    assert.equal(resolve(target, wrapper), null)
    assert.equal(resolve('other.ts', entry), null)
    const source: unknown = Reflect.apply(load, {}, [wrapper])
    assert.ok(typeof source === 'string')
    assert.match(source, /configureServerErrors\(\)/u)
    assert.match(source, /event.nonce = \{ script: false, style: false \}/u)
    const manifest = 'virtual:solid-server-function-manifest'
    const check = (code: string, id: string): unknown =>
      Reflect.apply(transform, {}, [code, id])
    assert.doesNotThrow(() => check('', manifest))
    assert.doesNotThrow(() => check('import "x"', 'other'))
    assert.throws(
      () => check('import "x"', manifest),
      /cannot publish server functions/u
    )
  }
})

it('checks the published files for relative and same-origin sitemap links', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'static-sitemap-files-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const publicDir = path.join(root, 'public')
  await mkdir(publicDir)
  const envKey = 'VITE_STATIC_SITEMAP_TEST_ORIGIN'
  const previous = env[envKey]
  env[envKey] = 'https://example.test'
  t.after(() => {
    if (previous === undefined) Reflect.deleteProperty(env, envKey)
    else env[envKey] = previous
  })
  for (const href of ['map.xml', 'https://example.test/map.xml']) {
    const config = await staticOutput({
      options: {
        root,
        output: 'static',
        seo: {
          originEnv: envKey,
          robots: { sitemapPaths: [href, 'https://external.test/other.xml'] }
        }
      },
      locales: []
    })
    assert.ok(config.hooks)
    const nitro = {
      options: { static: true, output: { dir: root, publicDir } }
    }
    await assert.rejects(
      config.hooks.compiled(nitro),
      /sitemap not published: \/map.xml/u
    )
    const map = path.join(publicDir, 'map.xml')
    await writeFile(map, '<urlset/>')
    await config.hooks.compiled(nitro)
    await rm(map)
  }
})

it('refuses pages that export a server component', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'static-server-page-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = path.join(root, 'src/routes/private')
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'index.tsx'),
    "export default function ServerPage() { 'use server'; return null }"
  )
  await assert.rejects(
    staticOutput({ options: { root, output: 'static' }, locales: [] }),
    /cannot publish the server operation/u
  )
})

it('preserves prerender failures outside the custom 404 response', async t => {
  const config = await fixture(t, '[...rest]')
  for (const [url, status] of [
    ['/404.html', HTTP_SERVER_ERROR],
    ['/', HTTP_NOT_FOUND]
  ] as const) {
    const error = { status }
    const route: PrerenderRoute = {
      route: url,
      error,
      contentType: 'text/html'
    }
    config.hooks['prerender:generate'](route)
    assert.equal(route.error, error)
  }
})

it('requires the root catch-all to return 404', async t => {
  const config = await fixture(t, '[...rest]')
  const route: PrerenderRoute = { route: '/404.html', contentType: 'text/html' }
  config.hooks['prerender:generate'](route)
  assert.match(route.error?.message ?? '', /httpStatus\(404\).*enumeration/u)
})
