/* oxlint-disable node/no-sync -- Preparation only edits an owned temporary application. */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

type Preparation = {
  app: string
  scenario: string
  profile: string
  mutation?: string
}
type Features = {
  markdown: boolean
  static: boolean
  llms: boolean
  full: boolean
}
type Write = { app: string; file: string; source: string }

function write({ app, file, source }: Write): void {
  const target = path.join(app, file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, source)
}

function featuresFor({ scenario, profile }: Preparation): Features {
  const disabled =
    scenario === 'client-only' ||
    ['isolated-meta-only', 'isolated-publication-off'].includes(profile)
  const markdown = !disabled && profile !== 'isolated-llms-only'
  const llms =
    !disabled &&
    !['isolated-markdown-only', 'isolated-dynamic-only'].includes(profile)
  const isStatic = markdown && profile !== 'isolated-dynamic-only'
  return { markdown, static: isStatic, llms, full: isStatic && llms }
}

export function preparePublicationScenario(options: Preparation): void {
  const { app, mutation } = options
  const features = featuresFor(options)
  write({
    app,
    file: 'scenario-publication.json',
    source: JSON.stringify(features)
  })
  if (!features.markdown && !features.llms) return
  const config = path.join(app, 'vite.config.ts')
  const source = readFileSync(config, 'utf8')
  assert.ok(source.includes('seo: {'))
  const markdown = features.markdown ? { static: features.static } : false
  const budget = mutation === 'llms-budget' ? { maxBytes: 1 } : {}
  const llms = features.llms ? budget : false
  writeFileSync(
    config,
    source.replace(
      'seo: {',
      `seo: { markdown: ${JSON.stringify(markdown)}, llms: ${JSON.stringify(llms)}, llmsFull: ${features.full ? '{}' : 'false'},`
    )
  )
  if (!existsSync(path.join(app, 'src/seo-site.ts'))) {
    write({
      app,
      file: 'src/seo-site.ts',
      source: `import { getLocale } from '@evertondgn/solid-runtime/i18n/locale'
import { origin } from '@evertondgn/solid-runtime/seo/origin'

export const site = {title: 'Scenario application', description: 'Independent publication fixture', url: origin, get locale(): string {return getLocale()}, image: {path: '/cover.png', width: 1200, height: 630, alt: 'Cover'}}
`
    })
  }
  write({
    app,
    file: 'src/publication-router.ts',
    source: `import { delocalizePathname } from '@evertondgn/solid-runtime/i18n/urls'
import { createRouter } from '@solidjs/router'
import { fileRoutes } from '@solidjs/router/fs'
import { pageRoutes } from 'virtual:file-routes'

export const publicationRouter = createRouter({routes: fileRoutes(pageRoutes), transformUrl: delocalizePathname})
`
  })
  const optIn = features.static ? 'true' : "'dynamic'"
  const info = `{seo: {title: 'Publication page'}, markdown: ${features.markdown ? optIn : 'false'}, llms: ${features.llms}}`
  for (const file of ['src/routes/index.tsx', 'src/routes/about/index.tsx']) {
    const target = path.join(app, file)
    const original = existsSync(target)
      ? readFileSync(target, 'utf8')
      : 'export default function Home() {return <main>Home</main>}\n'
    write({
      app,
      file,
      source: `export const route = {info: ${info}}\n${original}`
    })
  }
  if (features.markdown) {
    write({
      app,
      file: 'src/routes/converter/index.tsx',
      source: `export const route = {info: {seo: {title: 'Published converter'}, markdown: 'dynamic'}}
export default function Converter() {return <main><p>a<span>{' '}<span>b</span></span></p></main>}
`
    })
    const entry = path.join(app, 'src/entry-server.tsx')
    const entrySource = readFileSync(entry, 'utf8').replace(
      'return renderToStream(() => <App />, options)',
      "if (event && new URL(event.request.url).pathname.endsWith('/converter')) return renderToStream(() => <Converter />, options)\n  return renderToStream(() => <App />, options)"
    )
    writeFileSync(
      entry,
      `import Converter from './routes/converter/index.tsx'\n${entrySource}`
    )
    write({
      app,
      file: 'src/publication.ts',
      source: `import { createPublicationController } from '@evertondgn/solid-runtime/server/publication'

export const publication = createPublicationController()
`
    })
    const sitemap = path.join(app, 'src/infra/server/sitemap/index.ts')
    if (existsSync(sitemap)) {
      writeFileSync(
        sitemap,
        readFileSync(sitemap, 'utf8')
          .replace(
            "import { createPublicationController } from '@evertondgn/solid-runtime/server/publication'",
            "import { publication } from '../../../publication.ts'"
          )
          .replace('publication: createPublicationController()', 'publication')
      )
    }
    const middleware = path.join(app, 'src/middleware.ts')
    const original = readFileSync(middleware, 'utf8')
    const imports = `import { createMarkdownContent } from '@evertondgn/solid-runtime/seo/markdown'
import { publication } from './publication.ts'
import { publicationRouter } from './publication-router.ts'
import { site } from './seo-site.ts'
`
    writeFileSync(
      middleware,
      imports +
        original.replace(
          'security: createSecurityHeaders()',
          'document: createMarkdownContent({publication, router: publicationRouter, siteUrl: site.url, applySecurityHeaders: createSecurityHeaders().applySecurityHeaders}), security: createSecurityHeaders()'
        )
    )
  }
  if (features.llms) {
    write({
      app,
      file: 'src/routes/llms.txt/index.ts',
      source: `import { createLlms } from '@evertondgn/solid-runtime/seo/llms'
import { publicationRouter } from '../../publication-router.ts'
import { site } from '../../seo-site.ts'

export const GET = createLlms({site, router: publicationRouter, notes: ['Independent editorial selection'], fullPage: {path: '/llms-full.txt', title: 'Full pages', description: 'Static documents', section: 'Optional', isOptional: true}})
`
    })
  }
}

export const PUBLICATION_PROFILES = [
  'isolated-markdown-only',
  'isolated-llms-only',
  'isolated-publication-off',
  'isolated-dynamic-only'
]
