/* oxlint-disable node/no-sync -- These changes are limited to the owned temporary installed application. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

type Preparation = { app: string; profile: string; mutation?: string }

export function prepareSitemapScenario({
  app,
  profile,
  mutation
}: Preparation): void {
  if (!['isolated-meta-only', 'isolated-without-sitemap'].includes(profile)) {
    return
  }
  for (const relative of [
    'src/routes/sitemap.xml',
    'src/routes/sitemaps',
    'src/infra/server/sitemap',
    'src/infra/server/listCatalog'
  ]) {
    rmSync(path.join(app, relative), { recursive: true })
  }
  writeFileSync(
    path.join(app, 'src/routes/catalog/[id]/index.tsx'),
    'export default function Catalog() { return <main>Catalog</main> }\n'
  )
  const config = path.join(app, 'vite.config.ts')
  const source = readFileSync(config, 'utf8')
  assert.ok(source.includes('sitemap: true'))
  writeFileSync(
    config,
    source
      .replace('sitemap: true', 'sitemap: false')
      .replace(/sitemapPaths: \['\/sitemap.xml'\],\s*/u, '')
  )
  if (mutation === 'sitemap-import') {
    const directory = path.join(app, 'src/routes/unexpected-sitemap')
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      path.join(directory, 'index.ts'),
      `import { createSitemapRoutes } from '@evertondgn/solid-runtime/seo/sitemap-routes'
import { createPublicationController } from '@evertondgn/solid-runtime/server/publication'

export const GET = createSitemapRoutes({ sources: [], publication: createPublicationController(), siteUrl: 'https://scenario.example' }).index
`
    )
  }
}
