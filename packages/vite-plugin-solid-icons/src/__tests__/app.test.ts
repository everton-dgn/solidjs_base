import assert from 'node:assert/strict'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { build, createServer } from 'vite-plus'

import { createFixtureApp, fixtureConfig } from './fixture-app.ts'

type ServerEntry = { html: () => string }

// The application renders a hugeicons icon and two icons of its own folder.
const RENDERED_ICONS = 3

function isServerEntry(value: unknown): value is ServerEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'html' in value &&
    typeof value.html === 'function'
  )
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
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
      await build({
        ...fixtureConfig({ root, isSsr: false }),
        build: { outDir: 'dist/client', minify: false }
      })
      const bundle = await readBundle(path.join(root, 'dist/client'))
      const has = (text: string) => bundle.includes(text)

      // The Solid compiler moves the attributes of the root element into a
      // spread with the props; the raw import keeps the markup as a string.
      assert.equal(count(bundle, /"aria-hidden": "true"/gu), RENDERED_ICONS)
      assert.equal(count(bundle, /width: "1\.2em"/gu), RENDERED_ICONS)
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

      assert.equal(count(html, /<svg/gu), RENDERED_ICONS)
      assert.equal(
        count(html, /<svg[^>]*aria-hidden="true"/gu),
        RENDERED_ICONS
      )
      assert.match(html, /data-icon="logo"/u)
      assert.match(html, /<output id="raw">&lt;svg viewBox="0 0 24 24"/u)
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
      assert.equal(count(html, /<svg/gu), RENDERED_ICONS)
      assert.match(html, /data-icon="star"/u)
    }
  )
})
