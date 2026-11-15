import assert from 'node:assert/strict'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { build, createServer } from 'vite-plus'

import { checkIconTypes } from '../index.ts'
import {
  createFixtureApp,
  fixtureConfig,
  NAMED_ICONS_BY_PATH,
  NAMED_ICONS_FILE,
  TYPES_FILE
} from './fixture-app.ts'

type ServerEntry = { html: () => string }
type CountInput = { text: string; pattern: RegExp }
type OutputFiles = Record<string, string>
type ClientBuild = { root: string; outDir: string }

// The application imports github, star and logo by path, and arrow-left-01,
// 3d-move and moon by export name; two modules import arrow-left-01.
const ICON_MODULES = 6
const RENDERED_ICONS = 7
// The path of arrow-left-01 in @iconify-json/hugeicons.
const ARROW_LEFT_PATH = 'M15 6s-6 4.419-6 6s6 6 6 6'

function isServerEntry(value: unknown): value is ServerEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'html' in value &&
    typeof value.html === 'function'
  )
}

function count({ text, pattern }: CountInput): number {
  return text.match(pattern)?.length ?? 0
}

async function readOutput(folder: string): Promise<OutputFiles> {
  const files = await readdir(folder, { recursive: true, withFileTypes: true })
  const entries = await Promise.all(
    files
      .filter(file => file.isFile())
      .map(async (file): Promise<[string, string]> => {
        const absolute = path.join(file.parentPath, file.name)
        return [
          path.relative(folder, absolute),
          await readFile(absolute, 'utf8')
        ]
      })
  )
  return Object.fromEntries(entries)
}

async function buildClient({ root, outDir }: ClientBuild): Promise<void> {
  await build({
    ...fixtureConfig({ root, isSsr: false }),
    build: { outDir, minify: false }
  })
}

async function readBundle(folder: string): Promise<string> {
  const files = await readdir(folder, { recursive: true })
  const scripts = files.filter(file => file.endsWith('.js'))
  const sources = await Promise.all(
    scripts.map(file => readFile(path.join(folder, file), 'utf8'))
  )
  return sources.join('\n')
}

test('an application renders the icons', async context => {
  const root = await createFixtureApp()
  context.after(() => rm(root, { recursive: true, force: true }))

  await context.test(
    'the client build has the component and raw icons',
    async () => {
      await buildClient({ root, outDir: 'dist/client' })
      const bundle = await readBundle(path.join(root, 'dist/client'))
      const has = (text: string) => bundle.includes(text)

      // The Solid compiler moves the attributes of the root element into a
      // spread with the props; the raw import keeps the markup as a string.
      assert.equal(
        count({ text: bundle, pattern: /"aria-hidden": "true"/gu }),
        ICON_MODULES
      )
      assert.equal(
        count({ text: bundle, pattern: /width: "1\.2em"/gu }),
        ICON_MODULES
      )
      assert.equal(
        count({ text: bundle, pattern: new RegExp(ARROW_LEFT_PATH, 'gu') }),
        1,
        'the icon that two modules import by export name is one module'
      )
      assert.ok(has('<path fill=red d="M12 2l3 7'), 'the star from the folder')
      assert.ok(
        has('<svg><circle cx=8 cy=8 r=6>'),
        'the logo with a dot in its name'
      )
      assert.ok(
        has(String.raw`"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"`),
        'the raw SVG'
      )
    }
  )

  await context.test(
    'the build writes the declarations of the named imports',
    async () => {
      const types = await readFile(path.join(root, TYPES_FILE), 'utf8')
      const own = types.slice(types.indexOf("declare module 'icon:own' {"))

      assert.match(types, /declare module 'icon:hugeicons' \{/u)
      assert.match(types, /export const ArrowLeft01: IconComponent/u)
      assert.match(own, /export const Moon: IconComponent/u)
      assert.match(own, /export const LogoV2: IconComponent/u)
      await checkIconTypes({ root, collections: { own: './icons' } })
    }
  )

  await context.test(
    'the server build renders the icons to a string',
    async () => {
      await build({
        ...fixtureConfig({ root, isSsr: true }),
        build: {
          ssr: 'src/entry-server.tsx',
          outDir: 'dist/server',
          minify: false
        }
      })
      const entry: unknown = await import(
        pathToFileURL(path.join(root, 'dist/server/entry-server.mjs')).href
      )
      assert.ok(isServerEntry(entry))
      const html = entry.html()

      assert.equal(count({ text: html, pattern: /<svg/gu }), RENDERED_ICONS)
      assert.equal(
        count({ text: html, pattern: /<svg[^>]*aria-hidden="true"/gu }),
        RENDERED_ICONS
      )
      assert.match(html, /data-icon="logo"/u)
      assert.match(html, /data-icon="move"/u)
      assert.match(html, /data-icon="moon"/u)
      assert.match(html, /<output id="raw">&lt;svg viewBox="0 0 24 24"/u)
    }
  )

  await context.test(
    'the imports by export name build the bundle of the imports by path',
    async () => {
      await buildClient({ root, outDir: 'dist/named' })
      const file = path.join(root, NAMED_ICONS_FILE)
      const namedImports = await readFile(file, 'utf8')
      await writeFile(file, NAMED_ICONS_BY_PATH)
      try {
        await buildClient({ root, outDir: 'dist/by-path' })
      } finally {
        await writeFile(file, namedImports)
      }

      const named = await readOutput(path.join(root, 'dist/named'))
      const byPath = await readOutput(path.join(root, 'dist/by-path'))

      assert.ok(Object.keys(named).some(name => name.endsWith('.js')))
      assert.deepEqual(named, byPath)
    }
  )

  await context.test(
    'the dev server transforms and renders the icons',
    async () => {
      const server = await createServer({
        ...fixtureConfig({ root, isSsr: true }),
        server: { middlewareMode: true, ws: false },
        appType: 'custom'
      })
      context.after(() => server.close())
      const client = await server.environments.client.transformRequest(
        'icon:hugeicons/github'
      )
      const entry: unknown = await server.ssrLoadModule('/src/entry-server.tsx')
      assert.ok(isServerEntry(entry))
      const html = entry.html()

      assert.match(client?.code ?? '', /<svg/u)
      assert.equal(count({ text: html, pattern: /<svg/gu }), RENDERED_ICONS)
      assert.match(html, /data-icon="star"/u)
    }
  )
})
