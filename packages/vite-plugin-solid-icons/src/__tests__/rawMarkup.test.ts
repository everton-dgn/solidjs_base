import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { build, preview } from 'vite-plus'

import {
  FIGMA,
  ILLUSTRATOR_EXPORT_AS,
  INKSCAPE,
  SKETCH,
  SKETCH_OLD
} from '../compileIcon/__tests__/editor-files.ts'
import { launchBrowser } from './browser.ts'
import { createFixtureApp, defer, fixtureConfig } from './fixture-app.ts'

const EDITOR_FILES: Record<string, string> = {
  inkscape: INKSCAPE,
  illustrator: ILLUSTRATOR_EXPORT_AS,
  figma: FIGMA,
  sketch: SKETCH,
  'sketch-old': SKETCH_OLD
}
// Texts whose spaces draw: lines with their indentation, and the spaces that
// xml:space="preserve" keeps.
const TEXT_FILES: Record<string, string> = {
  'text-lines':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">\n  <text x="4" y="26" font-size="16">a\n    <tspan fill="red">b</tspan>\n    c</text>\n</svg>\n',
  'text-preserve':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text x="4" y="26" font-size="16" xml:space="preserve">  x   y  <tspan>z</tspan></text></svg>\n'
}
const ICON_FILES = { ...EDITOR_FILES, ...TEXT_FILES }
const NAMES = Object.keys(ICON_FILES)

function identifier(name: string): string {
  return name.replaceAll(/-(?<letter>[a-z])/gu, (_, letter: string) =>
    letter.toUpperCase()
  )
}

// One icon per page, so the ids of its gradients and masks are the only ones
// of the page.
const APP = `${NAMES.map(
  name =>
    `import ${identifier(name)} from 'icon:own/${name}'\nimport ${identifier(name)}Svg from 'icon:own/${name}?raw'`
).join('\n')}

const icons = {
${NAMES.map(name => `  '${name}': [${identifier(name)}, ${identifier(name)}Svg]`).join(',\n')}
}

export default function App() {
  const query = new URLSearchParams(location.search)
  const [Icon, svg] = icons[query.get('icon')]
  return query.get('mode') === 'raw' ? (
    <div id="icon" innerHTML={svg} />
  ) : (
    <div id="icon">
      <Icon />
    </div>
  )
}
`

test('the raw text of an icon draws as its component', async context => {
  const root = await createFixtureApp()
  defer({ context, task: () => rm(root, { recursive: true, force: true }) })
  for (const [name, file] of Object.entries(ICON_FILES)) {
    await writeFile(path.join(root, `icons/${name}.svg`), file)
  }
  await writeFile(path.join(root, 'src/App.tsx'), APP)
  const config = {
    ...fixtureConfig({ root, isSsr: false, typesFile: false }),
    logLevel: 'silent',
    build: { outDir: 'dist/client' }
  } as const
  await build(config)
  const server = await preview({
    ...config,
    preview: { port: 0, strictPort: false }
  })
  defer({ context, task: () => server.close() })
  const browser = await launchBrowser()
  defer({ context, task: () => browser.close() })
  const page = await browser.newPage({ deviceScaleFactor: 4 })
  const [url = ''] = server.resolvedUrls?.local ?? []
  const draw = async (search: string) => {
    await page.goto(new URL(`?${search}`, url).href)
    const svg = page.locator('#icon > svg')
    await svg.waitFor()
    const box = await svg.boundingBox()
    assert.ok(box && box.width > 0 && box.height > 0, search)
    return svg.screenshot()
  }

  for (const name of NAMES) {
    const component = await draw(`icon=${name}&mode=component`)
    const raw = await draw(`icon=${name}&mode=raw`)

    assert.ok(component.equals(raw), `the raw text of ${name} draws apart`)
  }
})
