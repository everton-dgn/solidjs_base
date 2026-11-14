import { createRouter, memoryHistory } from '@solidjs/router'
import { POLL, readScripts } from '@testing/seo/head-tags.ts'
import { UNSAFE_JSON_LD_TEXT } from '@testing/seo/hostile-text.ts'
import { SITE } from '@testing/seo/site.ts'

import { renderComponent } from '@/tests/renderComponent/index.tsx'

import { createSeo } from '../index.ts'

describe('optional editorial tags and safe JSON text', () => {
  it('omits social account tags while retaining the route graph and metadata', async () => {
    const Router = createRouter({
      routes: [{ path: '/*rest', component: () => null }],
      history: memoryHistory('/')
    })
    renderComponent(() => (
      <Router>
        {props => {
          createSeo({
            route: true,
            site: {
              title: UNSAFE_JSON_LD_TEXT,
              description: SITE.description,
              url: SITE.url,
              locale: SITE.locale,
              image: SITE.image
            }
          })
          return props.children
        }}
      </Router>
    ))
    await vi.waitUntil(() => readScripts().length === 1, POLL)
    expect(readScripts()[0]).not.toMatch(/[<\u2028\u2029]/u)
    expect(document.querySelector('meta[name="twitter:site"]')).toBeNull()
    expect(document.querySelector('meta[name="twitter:creator"]')).toBeNull()
    expect(
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content')
    ).toBe(UNSAFE_JSON_LD_TEXT)
  })

  it('escapes hostile structuredData before handing it to the head manager', async () => {
    renderComponent(() => {
      createSeo({
        structuredData: () => ({ '@type': 'Thing', name: UNSAFE_JSON_LD_TEXT })
      })
      return null
    })
    await vi.waitUntil(() => readScripts().length === 1, POLL)
    const [json] = readScripts()
    expect(json).not.toMatch(/[<\u2028\u2029]/u)
    expect(JSON.parse(json ?? '')).toStrictEqual({
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: UNSAFE_JSON_LD_TEXT
    })
  })
})
