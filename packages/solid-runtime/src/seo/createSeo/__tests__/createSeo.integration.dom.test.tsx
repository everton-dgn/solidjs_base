import { createRouter, memoryHistory } from '@solidjs/router'
import { POLL, readCanonical, readScripts } from '@testing/seo/head-tags.ts'
import { SITE, LOCALE_TAG_OVERRIDES } from '@testing/seo/site.ts'
import type { Product } from 'schema-dts'
import { createSignal, Show } from 'solid-js'

import { renderComponent } from '@/tests/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

const DATA_SCRIPTS = 2
const ALL_SCRIPTS = 3

function hasScript(text: string): boolean {
  return readScripts().some(json => json.includes(text))
}

function expectGlobalTags(): void {
  expect([
    document.head.querySelectorAll('title').length,
    document.head.querySelectorAll('link[rel="canonical"]').length,
    document.head.querySelectorAll('meta[name="robots"]').length,
    readScripts().filter(json => json.includes('"@type":"WebSite"')).length
  ]).toStrictEqual([1, 1, 1, 1])
}

describe('route SEO and custom data in the same Router', () => {
  it('updates and disposes independent owners during navigation and noindex', async () => {
    await vi.waitUntil(() => readScripts().length === 0, POLL)
    const history = memoryHistory('/publica')
    const [data, setData] = createSignal<Product | undefined>({
      '@type': 'Product',
      name: 'Inicial'
    })
    const [isVisible, setIsVisible] = createSignal(true)
    const [isMounted, setIsMounted] = createSignal(true)

    function ConditionalData() {
      createSeo({ structuredData: data })
      return null
    }

    function Page() {
      createSeo({
        structuredData: () => ({ '@type': 'Product', name: 'Fixo' })
      })
      return (
        <Show when={isVisible()}>
          <ConditionalData />
        </Show>
      )
    }

    const Router = createRouter({
      history,
      routes: [
        { path: '/publica', component: Page },
        {
          path: '/restrita',
          info: { seo: { noindex: true } },
          component: Page
        },
        { path: '/vazia', component: () => null }
      ]
    })

    renderComponent(() => (
      <Show when={isMounted()}>
        <Router>
          {props => {
            createSeo({
              route: true,
              site: SITE,
              localeTagOverrides: LOCALE_TAG_OVERRIDES
            })
            return props.children
          }}
        </Router>
      </Show>
    ))

    await vi.waitUntil(() => readScripts().length === ALL_SCRIPTS, POLL)
    expectGlobalTags()

    setData({ '@type': 'Product', name: 'Atualizado' })
    await vi.waitUntil(
      () => hasScript('Atualizado') && readScripts().length === ALL_SCRIPTS,
      POLL
    )
    setData(undefined)
    await vi.waitUntil(() => readScripts().length === DATA_SCRIPTS, POLL)
    setData({ '@type': 'Product', name: 'Retomado' })
    await vi.waitUntil(() => readScripts().length === ALL_SCRIPTS, POLL)

    history.set({ value: '/restrita', scroll: false })
    await vi.waitUntil(
      () => readScripts().length === DATA_SCRIPTS && !readCanonical(),
      POLL
    )
    expect(
      document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute('content')
    ).toBe('noindex')
    expect([hasScript('Fixo'), hasScript('Retomado')]).toStrictEqual([
      true,
      true
    ])

    setIsVisible(false)
    await vi.waitUntil(() => readScripts().length === 1, POLL)
    expect(readScripts()[0]).toContain('Fixo')
    setIsVisible(true)
    await vi.waitUntil(() => readScripts().length === DATA_SCRIPTS, POLL)

    history.set({ value: '/publica', scroll: false })
    await vi.waitUntil(
      () =>
        readCanonical() === `${SITE.url}/de/publica` &&
        readScripts().length === ALL_SCRIPTS,
      POLL
    )
    expectGlobalTags()

    history.set({ value: '/vazia', scroll: false })
    await vi.waitUntil(
      () =>
        readCanonical() === `${SITE.url}/de/vazia` &&
        readScripts().length === 1,
      POLL
    )
    expect([hasScript('Retomado'), hasScript('Fixo')]).toStrictEqual([
      false,
      false
    ])

    setIsMounted(false)
    await vi.waitUntil(
      () => readScripts().length === 0 && !readCanonical(),
      POLL
    )
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
