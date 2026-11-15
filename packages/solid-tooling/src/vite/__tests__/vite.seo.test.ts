import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from 'node:process'
import { it, type TestContext } from 'node:test'

import { seoModule } from '../../seo-module.ts'

const KEY = 'SOLID_SEO_TEST_ORIGIN'
const MESSAGE =
  /SOLID_SEO_TEST_ORIGIN must be an HTTP\(S\) origin without a path, query, fragment or credentials/u

async function root(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'solid-seo-config-'))
  const previous = env[KEY]
  delete env.SOLID_SEO_TEST_ORIGIN
  context.after(async () => {
    if (previous === undefined) delete env.SOLID_SEO_TEST_ORIGIN
    else env[KEY] = previous
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

it('validates origin only for enabled SEO or an imported origin entry', async context => {
  const directory = await root(context)
  const unused = seoModule({ root: directory, mode: 'production' })
  unused.configResolved()
  assert.equal(unused.load('unrelated'), null)
  assert.equal(unused.resolveId('unrelated'), undefined)
  const enabled = seoModule({
    root: directory,
    mode: 'production',
    seo: { originEnv: KEY }
  })
  assert.throws(
    () => enabled.configResolved(),
    /Missing site origin: SOLID_SEO_TEST_ORIGIN/u
  )
  assert.throws(
    () => enabled.load('\0virtual:solid-app/seo-origin'),
    /Missing site origin/u
  )
  for (const value of [
    'ftp://x',
    'https://example.com/path',
    'https://example.com/?q=1',
    'https://example.com/#part',
    'https://user:pass@example.com',
    'invalid'
  ]) {
    env[KEY] = value
    unused.configResolved()
    assert.throws(() => enabled.configResolved(), MESSAGE)
  }
})

it('provides only serializable origin and robots data with normalized URLs', async context => {
  const directory = await root(context)
  env[KEY] = 'https://example.com/'
  const plugin = seoModule({
    root: directory,
    mode: 'production',
    seo: {
      originEnv: KEY,
      robots: {
        groups: [{ userAgents: ['Bot'], disallow: ['/private'] }],
        sitemapPaths: ['/sitemap.xml']
      }
    }
  })
  plugin.configResolved()
  assert.equal(
    plugin.resolveId('virtual:solid-app/seo-origin'),
    '\0virtual:solid-app/seo-origin'
  )
  assert.equal(
    plugin.load('\0virtual:solid-app/seo-origin'),
    'export const origin = "https://example.com"'
  )
  assert.equal(
    plugin.load('\0virtual:solid-app/seo-robots'),
    'export const robots = {"groups":[{"userAgents":["Bot"],"disallow":["/private"]}],"sitemaps":["https://example.com/sitemap.xml"]}'
  )
})

it('omits sitemaps by default and refuses a route with robots disabled', async context => {
  const directory = await root(context)
  env[KEY] = 'http://example.com'
  const options = { root: directory, mode: 'test' }
  const plugin = seoModule({ ...options, seo: { originEnv: KEY, robots: {} } })
  assert.equal(
    plugin.load('\0virtual:solid-app/seo-robots'),
    'export const robots = {"groups":[],"sitemaps":[]}'
  )
  for (const seo of [
    undefined,
    false,
    { originEnv: KEY, robots: false }
  ] as const) {
    const disabled = seoModule({ ...options, seo })
    assert.throws(
      () => disabled.load('\0virtual:solid-app/seo-robots'),
      /robots route requires defineSolidApp/u
    )
  }
})

it('rejects functions, module paths and malformed robots lines in JavaScript configs', async context => {
  const directory = await root(context)
  const options = { root: directory, mode: 'production' }
  const modulePath = {
    ...options,
    seo: { originEnv: KEY, siteModule: './site.ts' }
  }
  assert.throws(() => seoModule(modulePath))
  assert.throws(() =>
    // @ts-expect-error JavaScript consumers must also reject executable configuration.
    seoModule({ ...options, seo: { robots: { groups: () => [] } } })
  )
  assert.throws(() =>
    seoModule({
      ...options,
      seo: { robots: { groups: [{ userAgents: ['Bot\nAllow: /'] }] } }
    })
  )
})
