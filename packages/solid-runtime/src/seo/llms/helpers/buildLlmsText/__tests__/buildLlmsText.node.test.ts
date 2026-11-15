import type { LlmsPage } from '../../../types.ts'
import { buildLlmsText } from '../index.ts'

type PageOverrides = Partial<LlmsPage> & Pick<LlmsPage, 'path'>

function page(overrides: PageOverrides): LlmsPage {
  return {
    title: overrides.path,
    description: '',
    section: 'Pages',
    isOptional: false,
    ...overrides
  }
}

describe('llms.txt generation', () => {
  it('publishes title, summary and page list with absolute URLs', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      pages: [page({ path: '/' }), page({ path: '/docs' })],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Resumo do site.',
        '',
        '## Pages',
        '',
        '- [/](https://example.com/)',
        '- [/docs](https://example.com/docs)',
        ''
      ].join('\n')
    )
  })

  it('publishes nonempty notes between the summary and sections', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      notes: [
        'Conteúdo em português.',
        ' \n ',
        'Sem API [pública]\nno momento.'
      ],
      pages: [page({ path: '/', title: 'Início' })],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Resumo do site.',
        '',
        '- Conteúdo em português.',
        String.raw`- Sem API \[pública\] no momento.`,
        '',
        '## Pages',
        '',
        '- [Início](https://example.com/)',
        ''
      ].join('\n')
    )
  })

  it('omits notes when all are blank', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      notes: ['', '  '],
      pages: [],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(['# Site', '', '> Resumo do site.', ''].join('\n'))
  })

  it('publishes only the heading when no page is selected', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      pages: [],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(['# Site', '', '> Resumo do site.', ''].join('\n'))
  })

  it('groups sections in manifest order and publishes optional pages last', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      pages: [
        page({ path: '/', title: 'Início', description: 'Apresentação.' }),
        page({ path: '/docs/a', title: 'A', section: 'Guias' }),
        page({ path: '/changelog', title: 'Changelog', isOptional: true }),
        page({ path: '/about', title: 'Sobre' }),
        page({
          path: '/docs/b',
          title: 'B',
          section: 'Guias',
          isOptional: true
        })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Resumo do site.',
        '',
        '## Pages',
        '',
        '- [Início](https://example.com/): Apresentação.',
        '- [Sobre](https://example.com/about)',
        '',
        '## Guias',
        '',
        '- [A](https://example.com/docs/a)',
        '',
        '## Optional',
        '',
        '- [Changelog](https://example.com/changelog)',
        '- [B](https://example.com/docs/b)',
        ''
      ].join('\n')
    )
  })

  it('escapes structural characters while keeping other text readable', () => {
    const text = buildLlmsText({
      title: 'Site [beta]\nTítulo',
      description: 'Resumo\ncom *ênfase* e <tags>.',
      pages: [
        page({
          path: '/docs(v2)',
          title: 'Guia [v2]\r\nExemplos',
          description: 'Use `code`\ncom _cuidado_.',
          section: 'C++ [API]'
        })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        String.raw`# Site \[beta\] Título`,
        '',
        '> Resumo com *ênfase* e <tags>.',
        '',
        String.raw`## C++ \[API\]`,
        '',
        '- [Guia \\[v2\\] Exemplos](https://example.com/docs%28v2%29): Use \\`code\\` com _cuidado_.',
        ''
      ].join('\n')
    )
  })

  it('prevents backticks and autolinks from consuming the link delimiter', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo.',
      pages: [
        page({
          path: '/guia',
          title: 'Como usar `',
          description: 'O caractere ` abre código.'
        }),
        page({ path: '/tipos', title: 'Lista<T> e <https://x.test>' })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toContain(
      '- [Como usar \\`](https://example.com/guia): O caractere \\` abre código.\n'
    )
    expect(text).toContain(
      '- [Lista\\<T\\> e \\<https://x.test\\>](https://example.com/tipos)\n'
    )
  })

  it('merges the Optional section into the final optional group', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo.',
      pages: [
        page({ path: '/a', title: 'A', section: 'Optional' }),
        page({ path: '/b', title: 'B', section: 'Guias' }),
        page({ path: '/c', title: 'C', isOptional: true })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toBe(
      [
        '# Site',
        '',
        '> Resumo.',
        '',
        '## Guias',
        '',
        '- [B](https://example.com/b)',
        '',
        '## Optional',
        '',
        '- [A](https://example.com/a)',
        '- [C](https://example.com/c)',
        ''
      ].join('\n')
    )
  })

  it('omits the separator when the page description is blank', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Resumo do site.',
      pages: [page({ path: '/', title: 'Início', description: ' \n ' })],
      siteUrl: 'https://example.com'
    })

    expect(text).toContain('- [Início](https://example.com/)\n')
    expect(text).not.toContain('):')
  })
})

describe('usage guidance in llms.txt', () => {
  it('preserves use-case links before the index even with repeated URLs', () => {
    const text = buildLlmsText({
      title: 'Site',
      description: 'Summary.',
      pages: [
        page({
          path: '/',
          title: 'Evaluate the template',
          description:
            'Inspect the rendered homepage before selecting the template.',
          section: 'When to use'
        }),
        page({ path: '/', title: 'Home' })
      ],
      siteUrl: 'https://example.com'
    })

    expect(text).toContain(
      '## When to use\n\n- [Evaluate the template](https://example.com/): Inspect the rendered homepage before selecting the template.\n\n## Pages\n\n- [Home](https://example.com/)\n'
    )
  })
})
