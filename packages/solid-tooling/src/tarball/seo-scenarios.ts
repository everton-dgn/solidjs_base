/* oxlint-disable node/no-sync -- These mutations only affect the owned temporary installed application. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { stdout } from 'node:process'

import { prepareSitemapScenario } from './sitemap-scenarios.ts'
import { hasSitemap } from './sitemap-smoke.ts'

type Preparation = {
  app: string
  scenario: string
  profile: string
  mutation?: string
}
type Command = {
  cwd: string
  args: string[]
  deadline: number
  variables?: Record<string, string>
  expectedError?: RegExp
}
type Probe = {
  app: string
  deadline: number
  run: (command: Command) => Promise<string>
}

export function seoEnvironment(app: string): Record<string, string> {
  return hasSitemap(app) ||
    existsSync(path.join(app, 'src/routes/robots.txt/index.ts'))
    ? { VITE_SITE_URL: 'https://scenario.example' }
    : {}
}

export function prepareSeoScenario({
  app,
  scenario,
  profile,
  mutation
}: Preparation): void {
  prepareSitemapScenario({ app, profile, mutation })
  if (profile === 'isolated-meta-only') {
    assert.equal(scenario, 'ssr-plain')
    const config = path.join(app, 'vite.config.ts')
    const source = readFileSync(config, 'utf8')
    const withoutSeo = source.replace(/^ {2}seo: \{[\s\S]*?^ {2}\},\n/mu, '')
    assert.notEqual(
      withoutSeo,
      source,
      'The meta-only profile must remove SEO config'
    )
    writeFileSync(config, withoutSeo)
    const site = path.join(app, 'src/seo-site.ts')
    writeFileSync(
      site,
      readFileSync(site, 'utf8')
        .replace(/^import \{ origin \}[^\n]+\n/mu, '')
        .replace('url: origin', "url: 'https://scenario.example'")
    )
    unlinkSync(path.join(app, 'src/routes/robots.txt/index.ts'))
  }
  if (mutation === 'seo-import' && scenario === 'client-only') {
    const entry = path.join(app, 'src/App.tsx')
    writeFileSync(
      entry,
      `import { createSeo } from '@evertondgn/solid-runtime/seo/create-seo'\n${readFileSync(entry, 'utf8').replace('export default function App() {', "export default function App() {\n  createSeo({ structuredData: () => ({ '@type': 'Thing', name: 'Unexpected SEO' }) })")}`
    )
  }
}

export async function checkSeoOriginFailures({
  app,
  deadline,
  run
}: Probe): Promise<void> {
  const enabled = existsSync(path.join(app, 'src/routes/robots.txt/index.ts'))
  for (const value of ['ftp://x', 'https://scenario.example/path']) {
    await run({
      cwd: app,
      deadline,
      args: ['build'],
      variables: { VITE_SITE_URL: value },
      expectedError: enabled
        ? /VITE_SITE_URL must be an HTTP\(S\) origin without a path, query, fragment or credentials/u
        : undefined
    })
    stdout.write(
      `${enabled ? 'Rejected' : 'Accepted unused'} SEO origin: ${value}\n`
    )
  }
}
