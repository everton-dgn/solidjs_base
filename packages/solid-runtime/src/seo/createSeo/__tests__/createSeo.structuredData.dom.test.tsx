import { POLL, readScripts } from '@testing/seo/head-tags.ts'
import { UNSAFE_JSON_LD_TEXT } from '@testing/seo/hostile-text.ts'
import type { Product } from 'schema-dts'
import { createSignal, Show } from 'solid-js'
import * as v from 'valibot'

import { renderComponent } from '@/tests/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

const INSTANCES = 2
const NodeSchema = v.record(v.string(), v.unknown())

type StructuredDataAccessor = NonNullable<
  Parameters<typeof createSeo>[0]['structuredData']
>

function mountData(accessors: StructuredDataAccessor[]): void {
  renderComponent(() => {
    for (const accessor of accessors) createSeo({ structuredData: accessor })
    return null
  })
}

function parseNode(json: string | undefined): Record<string, unknown> {
  return v.parse(NodeSchema, JSON.parse(json ?? 'null'))
}

// The head registry applies and removes tags in a microtask after effects.
async function waitForScripts(count: number): Promise<string[]> {
  await vi.waitUntil(() => readScripts().length === count, POLL)
  return readScripts()
}

describe('page-owned structured data', () => {
  beforeEach(async () => {
    await waitForScripts(0)
  })

  it('wraps a node in @context and publishes it in the head', async () => {
    mountData([() => ({ '@type': 'FAQPage', name: 'Dúvidas' })])

    const [json] = await waitForScripts(1)
    expect(parseNode(json)).toStrictEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      name: 'Dúvidas'
    })
  })

  it('publishes a node list as @graph', async () => {
    // `as const` verifies that readonly lists are accepted.
    const nodes = [
      { '@type': 'Organization', name: 'Acme' },
      { '@type': 'Person', name: 'Ana' }
    ] as const
    mountData([() => nodes])

    const [json] = await waitForScripts(1)
    expect(parseNode(json)).toStrictEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Acme' },
        { '@type': 'Person', name: 'Ana' }
      ]
    })
  })

  it('keeps one script per instance', async () => {
    mountData([
      () => ({ '@type': 'Product', name: 'Primeiro' }),
      () => ({ '@type': 'Product', name: 'Segundo' })
    ])

    const scripts = await waitForScripts(INSTANCES)
    expect(scripts.map(json => parseNode(json).name)).toStrictEqual([
      'Primeiro',
      'Segundo'
    ])
  })

  it('updates the script when data changes and removes it on unmount', async () => {
    const [data, setData] = createSignal<Product>({
      '@type': 'Product',
      name: 'Antes'
    })
    const [isMounted, setIsMounted] = createSignal(true)

    function ProductData() {
      createSeo({ structuredData: data })
      return null
    }

    renderComponent(() => (
      <Show when={isMounted()}>
        <ProductData />
      </Show>
    ))
    await waitForScripts(1)

    setData({ '@type': 'Product', name: 'Depois' })
    await vi.waitUntil(() => readScripts()[0]?.includes('Depois'), POLL)
    expect(readScripts()).toHaveLength(1)

    setIsMounted(false)
    await waitForScripts(0)
    expect(readScripts()).toHaveLength(0)
  })

  it('publishes, removes and republishes data independently of other instances', async () => {
    const [data, setData] = createSignal<Product>()

    function ProductData() {
      createSeo({
        structuredData: () => ({ '@type': 'Product', name: 'Fixo' })
      })
      createSeo({ structuredData: data })
      return null
    }

    renderComponent(ProductData)
    const [fixed] = await waitForScripts(1)
    expect(parseNode(fixed).name).toBe('Fixo')

    setData({ '@type': 'Product', name: 'Condicional' })
    const published = await waitForScripts(INSTANCES)
    expect(published.map(json => parseNode(json).name)).toContain('Condicional')

    setData(undefined)
    await expect(waitForScripts(1)).resolves.toStrictEqual([fixed])

    setData({ '@type': 'Product', name: 'Retomado' })
    const resumed = await waitForScripts(INSTANCES)
    expect(resumed.map(json => parseNode(json).name)).toStrictEqual(
      expect.arrayContaining(['Fixo', 'Retomado'])
    )
  })

  it('inserts JSON as text without creating elements from data', async () => {
    mountData([() => ({ '@type': 'Thing', name: UNSAFE_JSON_LD_TEXT })])

    const [json] = await waitForScripts(1)
    expect(parseNode(json).name).toBe(UNSAFE_JSON_LD_TEXT)
    expect(document.querySelector('[data-json-ld-injected]')).toBeNull()
  })
})
