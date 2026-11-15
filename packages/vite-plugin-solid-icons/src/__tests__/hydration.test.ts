import assert from 'node:assert/strict'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { build, preview } from 'vite-plus'

import { launchBrowser } from './browser.ts'
import { createFixtureApp, defer, fixtureConfig } from './fixture-app.ts'

type ServerEntry = { html: () => string; script: () => string }
type HydrationState = {
  nodes: number
  newNodes: number
  changes: number
  text: string | null
  style: string | null
}

// A text of several lines, whose spaces draw, and a <style> of several lines
// with CSS nesting, quotes and a ">".
const LINES_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">\n  <text x="4" y="26" font-size="16">a\n    <tspan fill="red">b &amp; c</tspan>\n    d</text>\n</svg>\n'
const LINES_TEXT = 'a\n    b & c\n    d'
const STYLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">\n  <style>\n    text { fill: red; &amp;:hover { fill: blue } }\n    .a > .b::after { content: "x &amp; y" }\n  </style>\n  <text class="a" x="4" y="26">s</text>\n</svg>\n'
const STYLE_TEXT =
  '\n    text { fill: red; &:hover { fill: blue } }\n    .a > .b::after { content: "x & y" }\n  '
const APP = `import Lines from 'icon:own/lines'
import Styled from 'icon:own/styled'

export default function App() {
  return (
    <main>
      <Lines data-icon="lines" />
      <Styled data-icon="styled" />
    </main>
  )
}
`
const SERVER_ENTRY = `import { generateHydrationScript, renderToString } from '@solidjs/web'
import App from './App.tsx'

export const html = () => renderToString(() => <App />)
export const script = () => generateHydrationScript()
`
const CLIENT_ENTRY = `import { hydrate } from '@solidjs/web'
import App from './App.tsx'

hydrate(() => <App />, document.querySelector('#app')!)
document.documentElement.dataset.hydrated = ''
`
const APP_ELEMENT = '<div id="app"></div>'
// Runs while the page parses, before the module that hydrates: it keeps the
// nodes that the server wrote and records every change to them.
const WATCH_SCRIPT = `<script>
  const app = document.querySelector('#app')
  const nodes = new WeakSet()
  const walker = document.createTreeWalker(app)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.add(node)
  const changes = []
  const observer = new MutationObserver(records => changes.push(...records))
  observer.observe(app, { subtree: true, childList: true, attributes: true, characterData: true })
  globalThis.__hydration = { nodes, changes, observer }
</script>`
// Reads the page after the tasks that the hydration queued.
const READ_STATE = `(async () => {
  await new Promise(resolve => setTimeout(resolve))
  const { nodes, changes, observer } = globalThis.__hydration
  changes.push(...observer.takeRecords())
  const walker = document.createTreeWalker(document.querySelector('#app'))
  let count = 0
  let newNodes = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    count += 1
    if (!nodes.has(node)) newNodes += 1
  }
  return {
    nodes: count,
    newNodes,
    changes: changes.length,
    text: document.querySelector('[data-icon="lines"] text').textContent,
    style: document.querySelector('[data-icon="styled"] style').textContent
  }
})()`
const RENDERED_ICONS = 2

function isServerEntry(value: unknown): value is ServerEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'html' in value &&
    typeof value.html === 'function' &&
    'script' in value &&
    typeof value.script === 'function'
  )
}

test('an icon hydrates as the server rendered it', async context => {
  const root = await createFixtureApp()
  defer({ context, task: () => rm(root, { recursive: true, force: true }) })
  const files = {
    'icons/lines.svg': LINES_SVG,
    'icons/styled.svg': STYLE_SVG,
    'src/App.tsx': APP,
    'src/entry-server.tsx': SERVER_ENTRY,
    'src/entry-client.tsx': CLIENT_ENTRY
  }
  for (const [file, content] of Object.entries(files)) {
    await writeFile(path.join(root, file), content)
  }
  const config = {
    ...fixtureConfig({ root, isSsr: true, typesFile: false }),
    logLevel: 'silent'
  } as const
  await build({
    ...config,
    build: { ssr: 'src/entry-server.tsx', outDir: 'dist/server' }
  })
  const entry: unknown = await import(
    pathToFileURL(path.join(root, 'dist/server/entry-server.mjs')).href
  )
  assert.ok(isServerEntry(entry))
  const html = entry.html()
  assert.equal(html.match(/<svg/gu)?.length, RENDERED_ICONS)

  // The Solid plugin of a server application writes a client that hydrates.
  await build({ ...config, build: { outDir: 'dist/client' } })
  const index = path.join(root, 'dist/client/index.html')
  const page = await readFile(index, 'utf8')
  assert.ok(page.includes(APP_ELEMENT))
  await writeFile(
    index,
    page.replace(
      APP_ELEMENT,
      `${entry.script()}<div id="app">${html}</div>${WATCH_SCRIPT}`
    )
  )
  const server = await preview({
    ...config,
    build: { outDir: 'dist/client' },
    preview: { port: 0, strictPort: false }
  })
  defer({ context, task: () => server.close() })
  const browser = await launchBrowser()
  defer({ context, task: () => browser.close() })
  const tab = await browser.newPage()
  const problems: string[] = []
  tab.on('pageerror', error => problems.push(error.message))
  tab.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      problems.push(`${message.type()}: ${message.text()}`)
    }
  })
  const [url = ''] = server.resolvedUrls?.local ?? []
  await tab.goto(url)
  await tab.locator('html[data-hydrated]').waitFor({ state: 'attached' })
  const state = await tab.evaluate<HydrationState>(READ_STATE)

  assert.ok(state.nodes > 0)
  assert.equal(state.newNodes, 0, 'the hydration added or replaced a node')
  assert.equal(state.changes, 0, 'the hydration changed a node')
  assert.equal(state.text, LINES_TEXT)
  assert.equal(state.style, STYLE_TEXT)
  assert.deepEqual(problems, [])
})
