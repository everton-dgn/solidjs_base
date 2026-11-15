import assert from 'node:assert/strict'
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it, type TestContext } from 'node:test'
import { pathToFileURL } from 'node:url'

import type { Page } from 'playwright'
import { build, createServer, preview } from 'vite-plus'

import { launchBrowser } from './browser.ts'
import { createFixtureApp, defer, fixtureConfig } from './fixture-app.ts'

type ServerEntry = { html: () => string }
type EntryInput = { context: TestContext; code: string; files?: Files }
type RefusalBuild = { root: string; code: string; isSsr: boolean }
type Files = Record<string, string>
type RefusedSvg = [name: string, svg: string, message: RegExp]
type FilesInput = { root: string; files: Files }
type TextScope = { page: Page; scope: string }

// Text and a value that would run code if the markup reached the module or
// the page as it is written. The metadata is editor data, which the plugin
// leaves out of the component and of the raw text.
const TRAP_TEXT = '{globalThis.__iconPwned = 1}'
const TRAP_VALUE = '"><img src="x" onerror="globalThis.__iconPwned = 2">'
// The lines and the indentation of the texts keep them as strings in the
// component, which the compiler escapes, also on the server.
const TRAP_TSPAN =
  '</tspan></text></svg><img src="x" onerror="globalThis.__iconPwned = 6">\n      '
// A browser reads the content of <title> and <desc> as HTML: the text has to
// stay text in the component, on the server and in the raw text.
const TRAP_TITLE =
  '\n    </title><img src="x" onerror="globalThis.__iconPwned = 8">\n  '
const TRAP_DESC =
  '\n    </desc><img src="x" onerror="globalThis.__iconPwned = 9">\n  '
const TRAP_BODY = `<title>\n    &lt;/title&gt;&lt;img src=&quot;x&quot; onerror=&quot;globalThis.__iconPwned = 8&quot;&gt;\n  </title><desc><![CDATA[${TRAP_DESC}]]></desc><text data-trap="&quot;&gt;&lt;img src=&quot;x&quot; onerror=&quot;globalThis.__iconPwned = 2&quot;&gt;">${TRAP_TEXT}</text><text><tspan>&lt;/tspan&gt;&lt;/text&gt;&lt;/svg&gt;&lt;img src=&quot;x&quot; onerror=&quot;globalThis.__iconPwned = 6&quot;&gt;\n      </tspan></text><style><![CDATA[text > tspan { fill: red }]]></style><metadata><p><iframe srcdoc="&lt;script&gt;globalThis.__iconPwned = 7&lt;/script&gt;"></iframe></p></metadata>`
const TRAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${TRAP_BODY}</svg>\n`
const TRAP_APP = `import Trap from 'icon:own/trap'
import trapSvg from 'icon:own/trap?raw'
import InstalledTrap from 'icon:trap/trap'
import installedTrapSvg from 'icon:trap/trap?raw'

export default function App() {
  return (
    <main>
      <Trap data-icon="trap" />
      <InstalledTrap data-icon="installed-trap" />
      <output id="raw">{trapSvg}</output>
      <div id="raw-html" innerHTML={trapSvg} />
      <div id="installed-raw-html" innerHTML={installedTrapSvg} />
    </main>
  )
}
`
// Markup that leaves the SVG in the HTML of a page, or that the HTML of the
// server writes as another text, as a body of an icon.
const ESCAPES: [name: string, body: string, message: RegExp][] = [
  [
    'style-cdata',
    '<style><![CDATA[</style><img src="x" onerror="globalThis.__iconPwned = 3"><style>]]></style>',
    /the text of <style> has a "<"/u
  ],
  [
    'style-entities',
    '<style>&lt;/style&gt;&lt;img src="x" onerror="globalThis.__iconPwned = 3"&gt;</style>',
    /the text of <style> has a "<"/u
  ],
  [
    'style-reference',
    '<style>text::after { content: "&amp;quot;" }</style>',
    /the text of <style> has a "&" before a letter or a "#"/u
  ],
  [
    'iframe',
    '<p><iframe srcdoc="&lt;script&gt;globalThis.__iconPwned = 4&lt;/script&gt;"></iframe></p>',
    /the SVG has a <p> element, which is not an SVG element/u
  ],
  [
    'embed',
    '<g><embed src="data:text/html,x"/></g>',
    /the SVG has a <embed> element, which is not an SVG element/u
  ],
  [
    'title-html',
    '<title><a href="#x">x</a></title>',
    /the SVG has a <a> element inside <title>, which holds text only/u
  ]
]
const TRAP_SET = {
  prefix: 'trap',
  width: 24,
  height: 24,
  icons: {
    trap: { body: TRAP_BODY },
    ...Object.fromEntries(ESCAPES.map(([name, body]) => [name, { body }]))
  }
}
// The global that the markup of TRAP_SVG would set if it ran.
const PROBE = '__iconPwned'
// The two components and the two raw texts of the trap.
const SCOPES = [
  '[data-icon="trap"]',
  '[data-icon="installed-trap"]',
  '#raw-html > svg',
  '#installed-raw-html > svg'
]
const TRAP_SVGS = 4
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
  const root = await createFixtureApp({ installed: { trap: TRAP_SET } })
  defer({ context, task: () => rm(root, { recursive: true, force: true }) })
  await writeFiles({
    root,
    files: {
      'icons/trap.svg': TRAP_SVG,
      'src/App.tsx': TRAP_APP,
      ...Object.fromEntries(
        ESCAPES.map(([name, body]) => [
          `icons/${name}.svg`,
          `<svg viewBox="0 0 24 24">${body}</svg>`
        ])
      )
    }
  })
  return root
}

async function buildEntry({ context, code, files = {} }: EntryInput) {
  const root = await createFixtureApp()
  defer({ context, task: () => rm(root, { recursive: true, force: true }) })
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

async function buildRefused({ root, code, isSsr }: RefusalBuild) {
  const entry = path.join(root, 'entry.js')
  await writeFile(entry, code)
  await build({
    ...fixtureConfig({ root, isSsr, typesFile: false }),
    logLevel: 'silent',
    build: isSsr
      ? { ssr: entry, write: false }
      : { write: false, rolldownOptions: { input: entry } }
  })
}

function importOf(specifier: string): string {
  return `import icon from ${JSON.stringify(specifier)}\nconsole.log(icon)\n`
}

async function assertTextOnly({ page, scope }: TextScope): Promise<void> {
  assert.equal(await page.locator(`${scope} title`).textContent(), TRAP_TITLE)
  assert.equal(await page.locator(`${scope} desc`).textContent(), TRAP_DESC)
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
    assert.match(html, /<tspan>&lt;\/tspan>&lt;\/text>&lt;\/svg>&lt;img/u)
    assert.doesNotMatch(html, /<img|<iframe|<metadata|<p>/u)
    // Two components and two raw texts, each an <svg> of its own.
    assert.equal(html.match(/<svg/gu)?.length, TRAP_SVGS)

    const browser = await launchBrowser()
    defer({ context, task: () => browser.close() })
    const page = await browser.newPage()
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`)
    for (const scope of SCOPES) await assertTextOnly({ page, scope })
    assert.equal(await page.locator('img, iframe, metadata, p').count(), 0)
    assert.equal(await page.evaluate(probe, PROBE), undefined)
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
    defer({ context, task: () => server.close() })
    const browser = await launchBrowser()
    defer({ context, task: () => browser.close() })
    const page = await browser.newPage()
    const [url = ''] = server.resolvedUrls?.local ?? []
    await page.goto(url)
    const icons = ['trap', 'installed-trap']
    for (const icon of icons) {
      const text = page.locator(`[data-icon="${icon}"] text[data-trap]`)
      await text.waitFor()

      assert.equal(await text.textContent(), TRAP_TEXT, icon)
      assert.equal(await text.getAttribute('data-trap'), TRAP_VALUE, icon)
      assert.equal(
        await page.locator(`[data-icon="${icon}"] tspan`).textContent(),
        TRAP_TSPAN,
        icon
      )
    }
    for (const raw of ['#raw-html', '#installed-raw-html']) {
      assert.equal(await page.locator(`${raw} > svg tspan`).count(), 1, raw)
    }
    for (const scope of SCOPES) await assertTextOnly({ page, scope })
    assert.equal(await page.locator('img, iframe, metadata, p').count(), 0)
    assert.equal(await page.evaluate(probe, PROBE), undefined)
    assert.match(
      (await page.locator('#raw').textContent()) ?? '',
      /^<svg aria-hidden="true" width="1\.2em" .*<title>\n {4}&lt;\/title>&lt;img .*data-trap="&quot;>&lt;img/su
    )
  })

  it('stops the build with the icon and the problem', async context => {
    const cases: RefusedSvg[] = [
      [
        'script',
        '<svg><script>globalThis.__iconPwned = 3</script></svg>',
        /Icon "own\/script": the SVG has a <script> element, which runs code\./u
      ],
      [
        'member',
        '<svg><window.alert/></svg>',
        /Icon "own\/member": the SVG has a <window\.alert> element, which is not an SVG element/u
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

  it('stops the build of markup that leaves the SVG or that the server writes apart, for the server too', async context => {
    const root = await trapApp(context)
    for (const [name, , message] of ESCAPES) {
      for (const collection of ['own', 'trap']) {
        const icon = `${collection}/${name}`
        const failure = new RegExp(`Icon "${icon}": ${message.source}`, 'u')
        for (const query of ['', '?raw']) {
          await assert.rejects(
            buildRefused({
              root,
              code: importOf(`icon:${icon}${query}`),
              isSsr: false
            }),
            failure,
            `${icon}${query}`
          )
        }
        await assert.rejects(
          buildRefused({
            root,
            code: `export { default } from 'icon:${icon}'\n`,
            isSsr: true
          }),
          failure,
          `${icon} on the server`
        )
      }
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
    defer({ context, task: () => rm(root, { recursive: true, force: true }) })
    await writeFiles({
      root,
      files: {
        'secret.svg': `<svg><text>${SECRET}</text></svg>`
      }
    })
    const server = await createServer({
      ...fixtureConfig({ root, isSsr: false, typesFile: false }),
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true },
      server: { port: 0, strictPort: false, watch: null }
    })
    defer({ context, task: () => server.close() })
    await server.listen()
    const [url = ''] = server.resolvedUrls?.local ?? []
    const paths = [
      '@id/solid-icon:own/..%2Fsecret.tsx',
      '@id/solid-icon:own/..%2F..%2Fsecret.tsx',
      '@id/__x00__icon:own/..%2Fsecret.js',
      '@id/solid-icon:own%2F..%2Fsecret.tsx'
    ]
    for (const request of paths) {
      const response = await fetch(new URL(request, url))
      const body = await response.text()

      assert.notEqual(response.status, HTTP_OK, request)
      assert.doesNotMatch(body, new RegExp(SECRET, 'u'), request)
    }
    const star = await fetch(new URL('@id/solid-icon:own/star.tsx', url))
    assert.equal(star.status, HTTP_OK)
  })

  it('does not follow a symbolic link out of the folder', async context => {
    const files = { 'outside/secret.svg': `<svg><text>${SECRET}</text></svg>` }
    const root = await createFixtureApp()
    defer({ context, task: () => rm(root, { recursive: true, force: true }) })
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
