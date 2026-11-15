import assert from 'node:assert/strict'
import { it } from 'node:test'

import { seoModule } from '../../seo-module.ts'
import { defineSolidApp } from '../index.ts'

const OPTIONS = { root: import.meta.dirname, mode: 'test' }
const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin'
}
const FRACTIONAL_BYTES = 1.5

it('refuses full publication without llms and static Markdown before loading plugins', () => {
  for (const seo of [
    { llmsFull: {} },
    { llmsFull: {}, llms: {} },
    { llmsFull: {}, markdown: { static: true } },
    { llmsFull: {}, llms: {}, markdown: {} }
  ]) {
    assert.throws(
      () =>
        defineSolidApp({
          root: OPTIONS.root,
          securityHeaders: SECURITY_HEADERS,
          seo
        }),
      /seo.llmsFull requires seo.llms and seo.markdown.static/u
    )
  }
})

it('rejects legacy publication configuration for JavaScript consumers', () => {
  const options = {
    root: OPTIONS.root,
    securityHeaders: SECURITY_HEADERS,
    publication: true
  }
  assert.throws(
    () => defineSolidApp(options),
    /publication was replaced by seo.markdown, seo.llms and seo.llmsFull/u
  )
})

it('rejects imported services when their publication feature is disabled', () => {
  const disabled = seoModule({ ...OPTIONS, seo: false })
  assert.throws(
    () => disabled.load('\0virtual:solid-app/seo-markdown'),
    /Markdown requires seo.markdown/u
  )
  assert.throws(
    () => disabled.load('\0virtual:solid-app/seo-llms'),
    /llms requires seo.llms/u
  )
  const llms = seoModule({ ...OPTIONS, seo: { llms: {} } })
  assert.equal(
    llms.load('\0virtual:solid-app/seo-llms'),
    'export const llms = {"maxBytes":1048576,"hasMarkdown":false,"hasLlmsFull":false}'
  )
})

it('validates publication budgets without accepting unknown options or executable values', () => {
  for (const maxBytes of [
    0,
    -1,
    FRACTIONAL_BYTES,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1
  ]) {
    assert.throws(() => seoModule({ ...OPTIONS, seo: { llms: { maxBytes } } }))
  }
  assert.throws(() =>
    seoModule({ ...OPTIONS, seo: { markdown: { timeoutMs: 2_147_483_648 } } })
  )
  const unknown = { markdown: { static: true, converter: './converter.ts' } }
  assert.throws(() => seoModule({ ...OPTIONS, seo: unknown }))
  assert.throws(() =>
    seoModule({
      ...OPTIONS,
      seo: {
        // @ts-expect-error JavaScript configuration must not accept executable converters.
        markdown: { converter: () => '' }
      }
    })
  )
})
