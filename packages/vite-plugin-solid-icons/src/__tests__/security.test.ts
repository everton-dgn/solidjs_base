import assert from 'node:assert/strict'
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from 'node:process'
import { describe, it, type TestContext } from 'node:test'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import { build, createServer, preview } from 'vite-plus'

import { createFixtureApp, fixtureConfig } from './fixture-app.ts'

type ServerEntry = { html: () => string }
type EntryInput = { context: TestContext; code: string; files?: Files }
type Files = Record<string, string>
type FilesInput = { root: string; files: Files }

// Text and a value that would run code if the markup reached the module or
// the page as it is written.
const TRAP_TEXT = '{globalThis.__iconPwned = 1}'
const TRAP_VALUE = '"><img src="x" onerror="globalThis.__iconPwned = 2">'
const TRAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text data-trap="&quot;&gt;&lt;img src=&quot;x&quot; onerror=&quot;globalThis.__iconPwned = 2&quot;&gt;">${TRAP_TEXT}</text><style><![CDATA[text > tspan { fill: red }]]></style></svg>\n`
const TRAP_APP = `import Trap from 'icon:own/trap'
import trapSvg from 'icon:own/trap?raw'

export default function App() {
  return (
    <main>
      <Trap data-icon="trap" />
      <output id="raw">{trapSvg}</output>
    </main>
  )
}
`
// The global that the markup of TRAP_SVG would set if it ran.
const PROBE = '__iconPwned'
const LARGE_SEGMENTS = 500_000
const LARGE_SIZE = 2_000_000
const LARGE_BUILD_TIME = 60_000
const HTTP_OK = 200
const SECRET = 'a file outside the folder of the collection'
const HOSTILE_SPECIFIERS = [
  'icon:own/../../../etc/passwd',
  'icon:own/../secret',
  'icon:own/..%2fsecret',
  'icon:own/..%2Fsecret',
  String.raw`icon:own/..\secret`,
  'icon:own/a\0b',
  'icon:own/a:b',
  'icon:own/a b',
  'icon:own/ secret',
  'icon:../x/y',
  'icon:own/%2e%2e/secret'
]

function isServerEntry(value: unknown): value is ServerEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'html' in value &&
    typeof value.html === 'function'
  )
}

function probe(name: string): unknown {
  const value: unknown = Reflect.get(globalThis, name)
  return value
}

async function writeFiles({ root, files }: FilesInput): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
}

async function trapApp(context: TestContext): Promise<string> {
  const root = await createFixtureApp()
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFiles({
    root,
    files: {
      'icons/trap.svg': TRAP_SVG,
      'src/App.tsx': TRAP_APP
    }
  })
  return root
}

async function buildEntry({ context, code, files = {} }: EntryInput) {
  const root = await createFixtureApp()
  context.after(() => rm(root, { recursive: true, force: true }))
  await writeFiles({ root, files: { ...files, 'entry.js': code } })
  await build({
    ...fixtureConfig({ root, isSsr: false, typesFile: false }),
    logLevel: 'silent',
    build: {
      write: false,
      rolldownOptions: { input: path.join(root, 'entry.js') }
    }
  })
  return root
}

function importOf(specifier: string): string {
  return `import icon from ${JSON.stringify(specifier)}\nconsole.log(icon)\n`
}

describe('the markup of an SVG file', () => {
  it('renders on the server as text, without running', async context => {
    const root = await trapApp(context)
    await build({
      ...fixtureConfig({ root, isSsr: true }),
      logLevel: 'silent',
      build: { ssr: 'src/entry-server.tsx', outDir: 'dist/server' }
    })
    const entry: unknown = await import(
      pathToFileURL(path.join(root, 'dist/server/entry-server.mjs')).href
    )
    assert.ok(isServerEntry(entry))
    const html = entry.html()

    assert.equal(probe(PROBE), undefined)
    assert.match(html, /\{globalThis\.__iconPwned = 1\}<\/text>/u)
    assert.match(html, /data-trap="&quot;>&lt;img src=&quot;x&quot;/u)
    assert.doesNotMatch(html, /<img/u)
  })

  it('renders in the browser as text, without running', async context => {
    const root = await trapApp(context)
    await build({
      ...fixtureConfig({ root, isSsr: false }),
      logLevel: 'silent',
      build: { outDir: 'dist/client' }
    })
    const server = await preview({
      ...fixtureConfig({ root, isSsr: false }),
      logLevel: 'silent',
      build: { outDir: 'dist/client' },
      preview: { port: 0, strictPort: false }
    })
    context.after(() => server.close())
    const browser = await chromium.launch(env.CI ? { channel: 'chrome' } : {})
    context.after(() => browser.close())
    const page = await browser.newPage()
    const [url = ''] = server.resolvedUrls?.local ?? []
    await page.goto(url)
    const text = page.locator('[data-icon="trap"] text')
    await text.waitFor()

    assert.equal(await text.textContent(), TRAP_TEXT)
    assert.equal(await text.getAttribute('data-trap'), TRAP_VALUE)
    assert.equal(await page.locator('img').count(), 0)
    assert.equal(await page.evaluate(probe, PROBE), undefined)
    assert.match(
      (await page.locator('#raw').textContent()) ?? '',
      /^<svg aria-hidden="true" width="1\.2em" .*data-trap="&quot;&gt;&lt;img/u
    )
  })

  it('stops the build with the icon and the problem', async context => {
    const cases: [string, string, RegExp][] = [
      [
        'script',
        '<svg><script>globalThis.__iconPwned = 3</script></svg>',
        /Icon "own\/script": the SVG has a <script> element, which runs code\./u
      ],
      [
        'member',
        '<svg><window.alert/></svg>',
        /Icon "own\/member": the element <window\.alert> is not an element in JSX/u
      ],
      [
        'broken',
        '<svg><g></svg>',
        /Icon "own\/broken": the SVG is not well-formed: <\/svg> closes <g>\./u
      ],
      [
        'entity',
        '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg><text>&xxe;</text></svg>',
        /Icon "own\/entity": the SVG is not well-formed: &xxe; is not an XML entity/u
      ],
      [
        'text',
        'not an svg',
        /Icon "own\/text": the file has no <svg> root element\./u
      ]
    ]
    for (const [name, svg, message] of cases) {
      await assert.rejects(
        buildEntry({
          context,
          code: importOf(`icon:own/${name}`),
          files: { [`icons/${name}.svg`]: svg }
        }),
        message
      )
    }
  })

  it('builds a large SVG file', async context => {
    const segments = 'l1 1'.repeat(LARGE_SEGMENTS)
    const svg = `<svg viewBox="0 0 24 24"><path d="M0 0${segments}"/></svg>`
    const started = performance.now()
    await buildEntry({
      context,
      code: importOf('icon:own/large'),
      files: { 'icons/large.svg': svg }
    })

    assert.ok(svg.length > LARGE_SIZE)
    assert.ok(performance.now() - started < LARGE_BUILD_TIME)
  })
})

describe('an icon import', () => {
  it('reads no file outside the folder of its collection', async context => {
    for (const specifier of HOSTILE_SPECIFIERS) {
      for (const query of ['', '?raw']) {
        await assert.rejects(
          buildEntry({
            context,
            code: importOf(`${specifier}${query}`),
            files: { 'secret.svg': `<svg><text>${SECRET}</text></svg>` }
          }),
          (error: unknown) => {
            assert.ok(error instanceof Error)
            assert.match(error.message, /Invalid icon import/u, specifier)
            assert.doesNotMatch(error.message, new RegExp(SECRET, 'u'))
            assert.doesNotMatch(error.message, /\/private\/|\/tmp\/|\/var\//u)
            return true
          }
        )
      }
    }
  })

  it('refuses a traversal sent to the dev server', async context => {
    const root = await createFixtureApp()
    context.after(() => rm(root, { recursive: true, force: true }))
    await writeFiles({
      root,
      files: {
        'secret.svg': `<svg><text>${SECRET}</text></svg>`
      }
    })
    const server = await createServer({
      ...fixtureConfig({ root, isSsr: false, typesFile: false }),
      logLevel: 'silent',
      server: { port: 0, strictPort: false, watch: null }
    })
    context.after(() => server.close())
    await server.listen()
    const [url = ''] = server.resolvedUrls?.local ?? []
    const paths = [
      '@id/icon:own/..%2Fsecret.tsx',
      '@id/icon:own/..%2F..%2Fsecret.tsx',
      '@id/__x00__icon:own/..%2Fsecret.js',
      '@id/icon:own%2F..%2Fsecret.tsx'
    ]
    for (const request of paths) {
      const response = await fetch(new URL(request, url))
      const body = await response.text()

      assert.notEqual(response.status, HTTP_OK, request)
      assert.doesNotMatch(body, new RegExp(SECRET, 'u'), request)
    }
    const star = await fetch(new URL('@id/icon:own/star.tsx', url))
    assert.equal(star.status, HTTP_OK)
  })

  it('does not follow a symbolic link out of the folder', async context => {
    const files = { 'outside/secret.svg': `<svg><text>${SECRET}</text></svg>` }
    const root = await createFixtureApp()
    context.after(() => rm(root, { recursive: true, force: true }))
    await writeFiles({ root, files })
    await symlink(
      path.join(root, 'outside/secret.svg'),
      path.join(root, 'icons/link.svg')
    )
    const buildLink = async () => {
      try {
        await build({
          ...fixtureConfig({ root, isSsr: false, typesFile: false }),
          logLevel: 'silent',
          build: {
            write: false,
            rolldownOptions: { input: path.join(root, 'entry.js') }
          }
        })
      } finally {
        await rm(path.join(root, 'entry.js'), { force: true })
      }
    }

    await writeFile(path.join(root, 'entry.js'), importOf('icon:own/link'))
    await assert.rejects(
      buildLink(),
      /Icon "own\/link" not found: link\.svg in the folder "icons" of the collection "own" is a symbolic link, and the plugin reads regular files only\./u
    )
    await writeFile(
      path.join(root, 'entry.js'),
      "import { Link } from 'icon:own'\nconsole.log(Link)\n"
    )
    await assert.rejects(buildLink(), /"Link" is not an icon of 'icon:own'/u)
  })
})
