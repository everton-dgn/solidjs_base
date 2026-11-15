import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readLlmsIndex } from '../helpers/readLlmsIndex/index.ts'

// Load the independent producer at execution time. A static import makes the
// declaration generator emit files into the neighboring source package.
const producerUrl = new URL(
  '../../../../../solid-runtime/src/seo/llms/helpers/buildLlmsText/index.ts',
  import.meta.url
)
function isBuilder(value: unknown): value is (options: unknown) => unknown {
  return typeof value === 'function'
}
async function buildLlmsText(options: unknown): Promise<string> {
  const producer: unknown = await import(producerUrl.href)
  assert.ok(
    producer !== null &&
      typeof producer === 'object' &&
      'buildLlmsText' in producer
  )
  const candidate = producer.buildLlmsText
  assert.ok(isBuilder(candidate))
  const result = candidate(options)
  assert.ok(typeof result === 'string')
  return result
}
const SITE_URL = 'https://example.com/'

describe('reading the llms.txt index', () => {
  it('reads title, description and all links in buildLlmsText format', async () => {
    const text = await buildLlmsText({
      title: 'Site [beta]',
      description: 'A `site` with \\ backslash',
      notes: ['See [docs](https://example.com/docs) and - [x](y)'],
      siteUrl: SITE_URL,
      pages: [
        {
          path: '/en/a (b).md',
          title: 'Title [x] <y> \\ `z`',
          description: 'Uses [brackets] and `code`',
          section: 'Pages',
          isOptional: false
        },
        {
          path: '/en/search?q=a%20b#results',
          title: 'Search',
          description: '',
          section: 'Pages',
          isOptional: false
        },
        {
          path: 'https://github.com/example/repo',
          title: 'Repository',
          description: 'External',
          section: 'Optional',
          isOptional: true
        }
      ]
    })
    assert.deepEqual(readLlmsIndex(text), {
      title: String.raw`Site \[beta\]`,
      description: String.raw`A \`site\` with \\ backslash`,
      links: [
        {
          label: 'Title [x] <y> \\ `z`',
          href: 'https://example.com/en/a%20%28b%29.md',
          summary: 'Uses [brackets] and `code`'
        },
        {
          label: 'Search',
          href: 'https://example.com/en/search?q=a%20b#results',
          summary: ''
        },
        {
          label: 'Repository',
          href: 'https://github.com/example/repo',
          summary: 'External'
        }
      ]
    })
  })

  it('rejects a missing title and accepts an index without links', () => {
    assert.throws(() => readLlmsIndex('no title'), /llms\.txt has no title/u)
    assert.deepEqual(readLlmsIndex('# Site\n'), {
      title: 'Site',
      description: '',
      links: []
    })
  })
})
