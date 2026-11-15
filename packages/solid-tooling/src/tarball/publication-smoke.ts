/* oxlint-disable node/no-sync -- Read completed artifacts in the owned temporary application. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import * as v from 'valibot'

type Build = { app: string; ids: string[]; clientIds: string[] }
type Smoke = { app: string; scenario: string; origin: string }
const FeaturesSchema = v.object({
  markdown: v.boolean(),
  static: v.boolean(),
  llms: v.boolean(),
  full: v.boolean()
})
const REQUEST_TIMEOUT = 5000
const HTTP_OK = 200

function readFeatures(app: string): v.InferOutput<typeof FeaturesSchema> {
  const file = path.join(app, 'scenario-publication.json')
  return v.parse(FeaturesSchema, JSON.parse(readFileSync(file, 'utf8')))
}

export function assertPublicationBuild({ app, ids, clientIds }: Build): void {
  const features = readFeatures(app)
  assert.equal(
    ids.some(id => /\/seo\/markdown\//u.test(id)),
    features.markdown,
    'Markdown service modules must follow seo.markdown'
  )
  assert.equal(
    ids.some(id => /\/seo\/llms\//u.test(id)),
    features.llms,
    'Disabled llms bundled an llms module'
  )
  if (!features.markdown) {
    assert.ok(
      !ids.some(id => /mdream/u.test(id)),
      'Disabled Markdown bundled the converter'
    )
  }
  assert.ok(
    !clientIds.some(id => /mdream|\/seo\/(?:markdown|llms)\//u.test(id)),
    'Publication services entered the client build'
  )
  const output = path.join(app, '.vercel/output')
  if (!existsSync(output)) return
  const config = readFileSync(path.join(output, 'config.json'), 'utf8')
  const files = readdirSync(path.join(output, 'static'), {
    recursive: true,
    encoding: 'utf8'
  })
  assert.equal(
    files.some(file => file.endsWith('.md')),
    features.static,
    'Static Markdown files must follow seo.markdown.static'
  )
  assert.equal(
    files.includes('llms.txt'),
    features.llms,
    'llms.txt artifact must follow seo.llms'
  )
  assert.equal(
    files.includes('llms-full.txt'),
    features.full,
    'llms-full.txt artifact must follow seo.llmsFull'
  )
  if (!features.static) {
    assert.doesNotMatch(
      config,
      /\\\.md|_markdown/u,
      'Disabled static Markdown left publication rules'
    )
  }
  if (!features.llms) {
    assert.doesNotMatch(
      config,
      /llms|describedby/u,
      'Disabled llms left a route or describedby Link'
    )
  }
}

export async function smokePublication({
  app,
  scenario,
  origin
}: Smoke): Promise<void> {
  if (scenario === 'client-only') return
  const features = readFeatures(app)
  const prefix = scenario === 'ssr-i18n' ? '/fr' : ''
  if (features.markdown) {
    const converted = await fetch(`${origin}${prefix}/converter.md`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })
    assert.equal(converted.status, HTTP_OK)
    // Published mdream 2.1.0 loses the separator inside nested inline wrappers.
    // The monorepo's optional patch produces "a b" for this same icon-free HTML.
    const convertedBody = await converted.text()
    assert.equal(convertedBody.trim(), 'ab')
  }
  for (const method of ['GET', 'HEAD']) {
    for (const page of ['/index.md', '/about.md']) {
      const response = await fetch(`${origin}${prefix}${page}`, {
        method,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      })
      assert.equal(response.status, HTTP_OK)
      const text = await response.text()
      if (features.markdown) {
        // The local preview serves static .md files as binary; dynamic responses carry their MIME type.
        assert.equal(
          response.headers.get('content-type'),
          features.static
            ? 'application/octet-stream'
            : 'text/markdown; charset=utf-8'
        )
        assert.equal(text.includes('Scenario application'), method === 'GET')
        assert.equal(text.includes('<html'), false)
      } else {
        assert.match(response.headers.get('content-type') ?? '', /text\/html/u)
      }
      assert.equal(
        response.headers.get('link')?.includes('describedby') ?? false,
        features.llms && features.markdown && !features.static
      )
    }
    const response = await fetch(`${origin}/llms.txt`, {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })
    const text = await response.text()
    if (features.llms) {
      assert.equal(response.status, HTTP_OK)
      if (method === 'HEAD') assert.equal(text, '')
      else {
        assert.match(text, /^# Scenario application\n/u)
        assert.ok(
          text.includes(
            `https://scenario.example${prefix}/about${features.markdown ? '.md' : ''}`
          )
        )
        assert.equal(text.includes('/llms-full.txt'), features.full)
      }
    } else {
      assert.doesNotMatch(text, /^# Scenario application\n/u)
      assert.equal(response.headers.has('link'), false)
    }
    const full = await fetch(`${origin}/llms-full.txt`, {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })
    const body = await full.text()
    if (features.full) {
      assert.equal(full.status, HTTP_OK)
      if (method === 'HEAD') assert.equal(body, '')
      else assert.ok(body.includes('Scenario application'))
    } else {
      assert.doesNotMatch(
        full.headers.get('content-type') ?? '',
        /text\/(?:plain|markdown)/u
      )
    }
  }
}
