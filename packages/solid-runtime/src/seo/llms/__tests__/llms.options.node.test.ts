import { SITE } from '@testing/seo/site.ts'

import { createLlms } from '../index.ts'

const { llms } = vi.hoisted(() => ({
  llms: { maxBytes: 1000, hasMarkdown: false, hasLlmsFull: false }
}))
vi.mock(import('virtual:solid-app/seo-llms'), () => ({ llms }))

const EXPECTED = '# é\n\n> ß\n'
const BYTES = new TextEncoder().encode(EXPECTED).byteLength
const router = {
  match: () => [{ pattern: '/about', info: { markdown: true as const } }]
}

describe('llms resource options', () => {
  beforeEach(() => {
    llms.maxBytes = BYTES
    llms.hasMarkdown = false
    llms.hasLlmsFull = false
  })

  it('accepts llms UTF-8 bytes at the exact limit', async () => {
    const get = createLlms({
      site: { ...SITE, title: 'é', description: 'ß' },
      router
    })
    expect(BYTES).toBeGreaterThan(EXPECTED.length)
    const response = await get()
    await expect(response.text()).resolves.toBe(EXPECTED)
  })

  it('rejects llms UTF-8 bytes one byte above the limit', async () => {
    llms.maxBytes = BYTES - 1
    const get = createLlms({
      site: { ...SITE, title: 'é', description: 'ß' },
      router
    })
    expect(BYTES).toBeGreaterThan(EXPECTED.length)
    await expect(get()).rejects.toThrow('llms.txt exceeds its byte budget')
  })

  it('keeps links in HTML when Markdown is disabled', async () => {
    llms.maxBytes = 1000
    const get = createLlms({
      site: SITE,
      router,
      pages: [
        {
          path: '/about',
          title: 'About',
          description: '',
          section: 'Pages',
          isOptional: false
        }
      ]
    })
    const response = await get()
    const text = await response.text()
    expect(text).toContain('(https://runtime.example/de/about)')
    expect(text).not.toContain('.md)')
    expect(text).not.toContain('/llms-full.txt')
  })

  it('requires editorial fullPage metadata when the aggregate is enabled', () => {
    llms.hasLlmsFull = true
    expect(() => createLlms({ site: SITE, router })).toThrow(
      'llmsFull requires an editorial fullPage'
    )
  })
})
