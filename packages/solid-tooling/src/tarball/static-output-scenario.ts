import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

import { run } from './scenario-process.ts'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

export async function checkStaticOutput({
  app,
  deadline,
  translated
}: {
  app: string
  deadline: number
  translated: boolean
}): Promise<void> {
  const file = (name: string) => path.join(app, name)
  const component = file('src/App.tsx')
  const appSource = await readFile(component, 'utf8')
  const aboutTitle = 'About the scenario'
  const localizedTitle = `{event && new URL(event.request.url).pathname.endsWith('/about') ? '${aboutTitle}' : 'Scenario application'}`
  const aboutRoute = `{ path: '/about', info: { seo: { title: '${aboutTitle}' } }, component: () => <main>Scenario application</main> },`
  const staticApp = translated
    ? appSource.replace(
        '<title>Scenario application</title>',
        `<title>${localizedTitle}</title>`
      )
    : appSource.replace('routes: [', `routes: [${aboutRoute}`)
  await writeFile(component, staticApp)
  const config = file('vite.config.ts')
  const configSource = await readFile(config, 'utf8')
  await writeFile(
    config,
    configSource
      .replace(/serverSetup: '[^']+',/u, "output: 'static',")
      .replace('securityHeaders: SECURITY_HEADERS,', '')
      .replace('sitemap: true', 'sitemap: { static: true }')
      .replace('seo: {', translated ? 'seo: { robots: {},' : 'seo: {')
  )
  for (const name of ['articles', 'catalog']) {
    await rm(file(`src/routes/${name}`), { recursive: true })
  }
  await mkdir(file('src/routes/robots.txt'), { recursive: true })
  await writeFile(
    file('src/routes/robots.txt/index.ts'),
    "export { GET } from '@evertondgn/solid-runtime/seo/robots-route'"
  )
  const sitemap = file('src/infra/server/sitemap/index.ts')
  const sitemapSource = await readFile(sitemap, 'utf8')
  await writeFile(
    sitemap,
    sitemapSource
      .replace(
        'index, pages, array, source',
        'index, pages, array, source, inventory'
      )
      .replace('  sources,', '  sources: [],')
  )
  await mkdir(file('src/routes/sitemaps/static.json'), { recursive: true })
  await writeFile(
    file('src/routes/sitemaps/static.json/index.ts'),
    "export { inventory as GET } from '../../../infra/server/sitemap/index.ts'"
  )
  await run({ cwd: app, deadline, args: ['build'] })
  for (const absent of [
    '.output/server',
    '.vercel/output',
    '.output/public/_markdown/static.json',
    '.output/public/sitemaps/static.json'
  ]) {
    await assert.rejects(access(file(absent)), { code: 'ENOENT' })
  }
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const name = path.extname(url.pathname)
      ? url.pathname
      : path.join(url.pathname, 'index.html')
    const stream = createReadStream(path.join(app, '.output/public', name))
    stream.on('error', () => response.writeHead(HTTP_NOT_FOUND).end())
    stream.pipe(response)
  })
  server.listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address !== null && typeof address === 'object')
    const origin = `http://127.0.0.1:${address.port}`
    const pages = translated ? ['', '/fr', '/de', '/it', '/ja'] : ['']
    for (const prefix of pages) {
      for (const page of ['/', '/about']) {
        const response = await fetch(origin + prefix + page)
        assert.equal(response.status, HTTP_OK, prefix + page)
        const html = await response.text()
        const homeTitle = translated ? 'Scenario application' : 'Scenario page'
        const title = page === '/about' ? aboutTitle : homeTitle
        assert.match(html, new RegExp(`<title[^>]*>${title}</title>`, 'u'))
        assert.doesNotMatch(html, /\snonce=/u)
        if (translated) {
          assert.ok(
            html.includes(`lang="${prefix.slice(1) || 'fr'}`),
            prefix + page
          )
        }
      }
    }
    const markdownPaths = (translated ? pages.slice(1) : pages).map(
      prefix => [`${prefix}/about.md`, 'Scenario application'] as const
    )
    for (const [name, content] of [
      ...markdownPaths,
      ['/sitemap.xml', '<?xml'],
      ['/robots.txt', 'User-agent:'],
      ['/llms.txt', '#'],
      ['/llms-full.txt', '#']
    ] as const) {
      const response = await fetch(origin + name)
      assert.equal(response.status, HTTP_OK, name)
      const body = await response.text()
      assert.ok(body.includes(content), name)
    }
  } finally {
    const closed = once(server, 'close')
    server.close()
    server.closeAllConnections()
    await closed
  }
  if (!translated) {
    const article = file('src/routes/articles/[id]')
    await mkdir(article, { recursive: true })
    await writeFile(
      path.join(article, 'index.tsx'),
      'export default function Article() { return <main>Article</main> }'
    )
    const staticSitemap = await readFile(sitemap, 'utf8')
    await writeFile(sitemap, staticSitemap.replace('sources: [],', 'sources,'))
    await run({
      cwd: app,
      deadline,
      args: ['build'],
      expectedError:
        /output: static cannot publish array or partitioned sitemap sources/u
    })
    await writeFile(sitemap, staticSitemap)
    await rm(article, { recursive: true })
    const client = file('src/entry-client.tsx')
    const source = await readFile(client, 'utf8')
    await writeFile(
      file('src/operation.ts'),
      "export async function operation() { 'use server'; return 'ok' }"
    )
    await writeFile(
      client,
      `import { operation } from './operation.ts'; void operation();\n${source}`
    )
    await run({
      cwd: app,
      deadline,
      args: ['build'],
      expectedError: /output: static cannot publish server functions/u
    })
  }
}
