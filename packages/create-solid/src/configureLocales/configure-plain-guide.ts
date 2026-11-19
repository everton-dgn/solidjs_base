import {
  applyProfileRules,
  type ProfileRuleGroup,
  type ProfileText
} from '../apply-profile-rules.ts'

const messages = 'src/constants/messages/index.ts'
const groups: readonly ProfileRuleGroup[] = [
  {
    files: ['README.md', 'docs/i18n.md'],
    modes: ['server'],
    rules: [[', `LocalizedLink`', '']]
  },
  {
    files: ['docs/architecture.md'],
    rules: [['`LocalizedLink` and `PageBadge`', 'and `PageBadge`']]
  },
  {
    files: ['docs/architecture.md'],
    hasTheme: true,
    rules: [[', `SiteContent` builds on\n  `LocalizedLink`', '']]
  },
  {
    files: ['AGENTS.md'],
    rules: [
      ['concurrency and of the number of locales', 'concurrency'],
      [
        /- Localized texts and links[\s\S]*?Objects used by the HTML/u,
        '- Objects used by the HTML'
      ]
    ]
  },
  { files: ['docs/seo/sitemap.md'], rules: [['localized URLs', 'URLs']] },
  {
    files: ['docs/testing.md'],
    modes: ['server'],
    hasSeo: true,
    rules: [['localized URLs', 'URLs']]
  },
  {
    files: ['docs/seo/markdown.md'],
    modes: ['server'],
    rules: [['localized paths', 'page paths']]
  },
  {
    files: ['README.md'],
    modes: ['static'],
    rules: [['localized URL', 'URL']]
  },
  { files: ['docs/seo/sitemap.md'], rules: [['localized URL', 'URL']] },
  {
    files: ['docs/seo/markdown.md'],
    modes: ['server'],
    rules: [['initial HTML, locales, negotiation', 'initial HTML, negotiation']]
  },
  {
    files: ['AGENTS.md'],
    hasSeo: false,
    rules: [
      [
        / (?:in|across) (?:all|the|its) (?:three|configured)\s+(?:locales|languages)/gu,
        ''
      ]
    ]
  },
  {
    files: ['AGENTS.md'],
    hasSeo: true,
    expectedMatches: 2,
    rules: [
      [
        / (?:in|across) (?:all|the|its) (?:three|configured)\s+(?:locales|languages)/gu,
        ''
      ]
    ]
  },
  {
    files: ['README.md', 'docs/seo/markdown.md'],
    modes: ['server'],
    rules: [
      [
        / (?:in|across) (?:all|the|its) (?:three|configured)\s+(?:locales|languages)/gu,
        ''
      ]
    ]
  },
  {
    files: ['docs/i18n.md', 'docs/seo/publication.md'],
    rules: [
      [
        / (?:in|across) (?:all|the|its) (?:three|configured)\s+(?:locales|languages)/gu,
        ''
      ]
    ]
  },
  {
    files: ['docs/testing.md'],
    modes: ['server'],
    hasSeo: true,
    rules: [
      [
        / (?:in|across) (?:all|the|its) (?:three|configured)\s+(?:locales|languages)/gu,
        ''
      ]
    ]
  },
  {
    files: ['README.md'],
    modes: ['server'],
    hasSeo: true,
    rules: [['the four real pages in each locale', 'the four real pages']]
  },
  {
    files: ['docs/seo/markdown.md'],
    modes: ['server'],
    rules: [['one `.md` file per locale', 'one `.md` file per page']]
  },
  {
    files: ['docs/security.md'],
    modes: ['server'],
    hasSeo: true,
    rules: [['under the prefix of each locale', 'at their application paths']]
  },
  { files: ['docs/seo/sitemap.md'], rules: [['A locale group', 'An entry']] },
  {
    files: ['docs/testing.md'],
    modes: ['server'],
    hasSeo: true,
    rules: [['indivisible locale groups', 'indivisible entries']]
  },
  {
    files: ['docs/seo/sitemap.md'],
    rules: [
      [
        'the length of the URLs, the escapes and the\nalternates per locale',
        'URL length and XML escaping'
      ]
    ]
  },
  {
    files: ['AGENTS.md'],
    rules: [['@paraglide/messages.js', '@/constants/messages/index.ts']]
  },
  {
    files: ['docs/i18n.md'],
    modes: ['static', 'client'],
    expectedMatches: 2,
    rules: [['@paraglide/messages.js', '@/constants/messages/index.ts']]
  },
  {
    files: ['docs/i18n.md'],
    modes: ['server'],
    expectedMatches: 3,
    rules: [['@paraglide/messages.js', '@/constants/messages/index.ts']]
  },
  {
    files: ['docs/seo.md'],
    expectedMatches: 2,
    rules: [['@paraglide/messages.js', '@/constants/messages/index.ts']]
  },
  {
    files: ['README.md'],
    modes: ['static', 'client'],
    rules: [[/^- \[Translations\]\(docs\/i18n\.md\)\n/mu, '']]
  },
  {
    files: ['docs/server-errors.md'],
    rules: [
      [
        /setup, in the locale of the request, as described in\n {2}\[Locale of the public message\]\(#locale-of-the-public-message\)\./u,
        'setup.'
      ]
    ]
  },
  {
    files: ['AGENTS.md'],
    expectedMatches: 2,
    rules: [
      [
        /^## (?:Generated i18n files|Translations|Locale of the public message)\n[\s\S]*?(?=^## |(?![\s\S]))/gmu,
        ''
      ]
    ]
  },
  {
    files: ['docs/server-errors.md'],
    rules: [
      [
        /^## (?:Generated i18n files|Translations|Locale of the public message)\n[\s\S]*?(?=^## |(?![\s\S]))/gmu,
        ''
      ]
    ]
  },
  {
    files: ['AGENTS.md'],
    rules: [
      [
        /^## Application packages\n\n- URL helpers,[\s\S]*?(?=^## )/mu,
        '## Application packages\n\nUse the application message functions in `src/constants/messages/index.ts`.\n\n'
      ]
    ]
  },
  {
    files: ['AGENTS.md'],
    modes: ['server'],
    rules: [
      [
        /\. `i18n:generate` runs the compiled\n {2}generator from the package\./u,
        '.'
      ],
      [
        /they skip `i18n:generate` and\n {2}the CSS lint/u,
        'they skip the CSS lint'
      ]
    ]
  },
  {
    files: ['AGENTS.md'],
    modes: ['server'],
    hasSeo: true,
    rules: [
      [
        /\. The `\.md` files come in\n {2}per locale; when changing the Paraglide `urlPatterns`, review those patterns\./u,
        '.'
      ]
    ]
  },
  {
    files: ['README.md'],
    modes: ['server'],
    rules: [[/^\|[^\n]*(?:docs\/i18n\.md|vp run i18n:generate)[^\n]*\n/gmu, '']]
  },
  {
    files: ['docs/development.md'],
    rules: [[/^\|[^\n]*(?:docs\/i18n\.md|vp run i18n:generate)[^\n]*\n/gmu, '']]
  },
  { files: ['AGENTS.md'], rules: [[', `i18n` and `paraglide`', '']] },
  { files: ['docs/architecture.md'], rules: [[', `i18n`, `paraglide`', '']] },
  {
    files: ['docs/development.md'],
    rules: [
      [
        /Keep Paraglide, message-format and the Solid libraries/u,
        'Keep the Solid libraries'
      ]
    ]
  },
  {
    files: ['docs/seo.md'],
    rules: [
      [
        /The catalogs are in\n`i18n\/\{pt,en,es\}\.json` next to those files\./u,
        `Read the text from \`${messages}\`.`
      ],
      [
        /, and the production i18n test\nchecks that each body stays only in the route module\./u,
        '.'
      ]
    ]
  },
  {
    files: ['docs/seo/sitemap.md'],
    rules: [
      [
        /With i18n, each page produces[\s\S]*?\(\.\.\/i18n\.md(?:#seo-indexes)?\)\./u,
        'Each page has one URL. The static inventory is split by URL count and by the UTF-8 size of the complete XML.'
      ]
    ]
  },
  {
    files: ['docs/seo/indexes.md'],
    rules: [
      [
        /llms\.txt uses\n`i18n\/locale-context`:[\s\S]*?without manual edits\./u,
        'The index uses the language configured in `vite.config.ts`.'
      ]
    ]
  },
  {
    files: ['docs/security.md'],
    modes: ['server'],
    rules: [
      [
        /That is why\n {2}the preset writes[\s\S]*?without these headers\./u,
        'Keep static file patterns distinct so responses receive the expected headers.'
      ]
    ]
  }
]

export function configurePlainGuide(options: ProfileText): string {
  return applyProfileRules({ ...options, groups })
}
