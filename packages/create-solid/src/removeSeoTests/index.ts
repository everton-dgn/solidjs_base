import type { EditFile } from '../types.ts'

type SeoTestEdits = { edit: EditFile; isServer: boolean }

export function removeSeoTests({ edit, isServer }: SeoTestEdits): void {
  edit(
    'src/tests/pages/I18n/I18n.urlPattern.production.e2e.test.ts',
    (text, apply) =>
      apply(text, [
        [
          "toHaveTitle('Página não encontrada')",
          "toHaveTitle('SolidJS Boilerplate')"
        ]
      ])
  )
  edit('src/tests/pages/I18n/I18n.e2e.test.ts', (text, apply) =>
    apply(text, [
      [
        /await expect\(\n\s*page.locator\('head meta\[name="description"\]'\)\n\s*\)\.toHaveAttribute\('content', messages.errorFallback_runtimeDescription\)/u,
        `await expect(page.locator('head meta[name="description"]')).toHaveCount(0)`
      ]
    ])
  )
  edit('src/tests/fixtures/e2e/routes/(base)/blog/[slug].tsx', (text, apply) =>
    apply(text, [
      [', type RouteDefinition', ''],
      [/^import \{ listBlogEntries[\s\S]*?(?=export default)/mu, '']
    ])
  )
  edit('playwright.config.ts', (text, apply) =>
    apply(text, [
      [/,\n {4}markdown:[^\n]*\n {4}publicationLoad:[^\n]*/u, '', isServer]
    ])
  )
  edit('src/middleware/__tests__/middleware.node.test.ts', (text, apply) =>
    apply(text, [
      [
        / {2}\/\/ covers sitemap.xml and robots.txt; here only the chaining matters\.\n/u,
        ''
      ]
    ])
  )
  for (const file of [
    'src/tests/pages/Home/Home.production.e2e.test.ts',
    'src/tests/pages/I18n/I18n.e2e.test.ts'
  ]) {
    edit(file, (text, apply) =>
      apply(text, [
        [
          /^ *await expect\(page\.locator\('head link\[rel="canonical"\]'\)\)[^\n]*\n/gmu,
          '',
          file.startsWith('src/tests/pages/Home/')
        ],
        [
          /^ *await expect\(page\.locator\('head meta\[name="robots"\]'\)\)\.toHaveAttribute\(\n[^\n]*\n[^\n]*\n *\)\n/mu,
          ''
        ],
        [/^ *await expect\(page\)\.toHaveTitle\([^\n]*\n/mu, '']
      ])
    )
  }
  edit('src/tests/pages/OutsideError/OutsideError.e2e.test.ts', (text, apply) =>
    apply(text, [
      ["['/robots.txt', '/_server/fixture']", "['/_server/fixture']"]
    ])
  )
  for (const file of [
    'src/tests/pages/UiKit/UiKit.e2e.test.ts',
    'src/tests/fixtures/e2e/routes/(base)/ui-kit/index.tsx'
  ]) {
    edit(file, (text, apply) =>
      apply(text, [
        ['/robots.txt', '/favicon/favicon.ico'],
        ['Robots file', 'Site icon']
      ])
    )
  }
  edit(
    'src/components/organisms/ErrorFallback/__tests__/ErrorFallback.dom.test.tsx',
    (text, apply) => {
      let result = apply(text, [
        [
          /function readMeta[\s\S]*?(?=describe\('navigation after a failure')/u,
          ''
        ],
        [', Errored', '']
      ])
      if (!result.includes('createSignal<')) {
        result = apply(result, [
          [/^import \{ createSignal \}[^\n]*\n/mu, ''],
          [/^import type \{ ErrorFallbackKind[^\n]*\n/mu, '']
        ])
      }
      if (!result.includes('m.')) {
        result = apply(result, [[/^import \{ m \}[^\n]*\n/mu, '']])
      }
      return result.trimStart()
    }
  )
  for (const file of [
    'src/tests/fixtures/e2e/routes/(base)/backend-error.tsx',
    'src/tests/fixtures/e2e/routes/(base)/control-signal.tsx',
    'src/tests/fixtures/e2e/routes/(base)/fragment-css.tsx',
    'src/tests/fixtures/e2e/routes/(base)/hydration.tsx',
    'src/tests/fixtures/e2e/routes/(base)/i18n-action.tsx',
    'src/tests/fixtures/e2e/routes/(base)/i18n-redirect.tsx',
    'src/tests/fixtures/e2e/routes/(base)/late-redirect.tsx',
    'src/tests/fixtures/e2e/routes/(base)/outdated-page.tsx',
    'src/tests/fixtures/e2e/routes/(base)/outside-error.tsx',
    'src/tests/fixtures/e2e/routes/(base)/ui-kit/fields.tsx',
    'src/tests/fixtures/e2e/routes/(base)/ui-kit/index.tsx'
  ]) {
    edit(file, (text, apply) =>
      apply(text, [
        [
          /export const route = \{\n {2}info: \{[\s\S]*?\n\}(?<constraint> satisfies RouteDefinition)?\n\n/u,
          'export const route = {}$<constraint>\n\n'
        ]
      ])
    )
  }
  edit('src/middleware/__tests__/middleware.node.test.ts', (text, apply) =>
    apply(text, [
      [
        /^describe\('containment of the Markdown adapter'[\s\S]*?(?=^describe\('responses with immutable headers')/mu,
        ''
      ],
      [/^import \{ (?:MAX_HTML_BYTES|isPublicError|Router) \}[^\n]*\n/gmu, ''],
      [/^import \{ getLocale, shouldRedirect \}[^\n]*\n/mu, ''],
      ['middleware, { createMiddleware }', 'middleware'],
      [/^const PUBLIC_MESSAGE_EN[^\n]*\n/mu, ''],
      [/^const ERROR_PAGE_LOG =\n[^\n]+\n/mu, ''],
      [/^\/\/ The inner chain[^\n]+\n[^\n]+\n/mu, ''],
      [/, like sitemap.xml and\n\/\/ robots.txt,/u, ',']
    ])
  )
  edit(
    'src/tests/pages/I18n/I18n.production.e2e.test.ts',
    (text, apply) =>
      `${apply(text, [
        [/^test\('isolates concurrent HTML and Markdown[\s\S]*/mu, ''],
        [/^import \{ readSiteOrigin \}[^\n]+\n/mu, ''],
        [/^const (?:REQUESTS|ALTERNATE_LINKS) = \d+\n/gmu, ''],
        [
          /^ *await expect\(page\.locator\('link\[rel="canonical"[\s\S]*?(?=^ *const header)/mu,
          ''
        ],
        [
          /^ *await expect\(page\)\.toHaveTitle\(language\.missing\)[\s\S]*?(?=^ *expect\(await isSameHeader)/mu,
          ''
        ]
      ]).trimEnd()}\n`
  )
}
