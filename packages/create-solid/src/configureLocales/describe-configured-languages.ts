import {
  applyProfileRules,
  type ProfileRuleGroup,
  type ProfileText
} from '../apply-profile-rules.ts'

const groups: readonly ProfileRuleGroup[] = [
  {
    files: ['README.md'],
    modes: ['server'],
    rules: [
      [
        /The root redirects to a locale, such as `\/en`\.\nUse the language button[^.]+\./u,
        'Open the home page and follow a link in the navigation.'
      ]
    ]
  },
  {
    files: ['docs/architecture.md'],
    modes: ['server'],
    rules: [
      [
        /the home page answers on `\/pt`,\n`\/en` and `\/es`,/u,
        'the home page renders at the application root,'
      ]
    ]
  },
  {
    files: ['docs/i18n.md'],
    rules: [
      [
        /`project.inlang\/settings.json` defines `pt`, `en` and `es`, with English as the\nbase locale\./u,
        '`project.inlang/settings.json` defines the languages and the base locale.'
      ],
      [
        /keeps `i18n\/pt.json`, `i18n\/en.json` and\n`i18n\/es.json`/u,
        'keeps a catalog for each configured locale'
      ]
    ]
  },
  {
    files: ['docs/i18n.md'],
    hasSeo: true,
    rules: [
      [
        /to preserve pt-BR, en-US and es-ES in HTML, Open\nGraph and JSON-LD/u,
        'to set language tags for HTML, Open Graph and JSON-LD'
      ]
    ]
  },
  {
    files: ['docs/i18n.md'],
    modes: ['server'],
    hasSeo: true,
    rules: [
      [/uses English and `\/en` URLs/u, 'uses the base language and its URLs']
    ]
  },
  {
    files: ['docs/seo.md'],
    hasI18n: true,
    rules: [
      [
        /the three locales and `x-default` pointing to English/u,
        'the configured locales and `x-default` pointing to the base locale'
      ]
    ]
  },
  {
    files: ['docs/ui.md'],
    rules: [
      [
        /The messages of the example must exist in the catalog of the consumer in the\nthree locales\./u,
        'Define the example messages before using them.'
      ]
    ]
  },
  {
    files: ['AGENTS.md'],
    hasSeo: true,
    hasI18n: true,
    rules: [
      [
        /in (?:its|the) three (?:locales|languages)/gu,
        'in the configured languages'
      ]
    ]
  },
  {
    files: ['README.md'],
    modes: ['server'],
    hasI18n: true,
    rules: [
      [
        /in (?:its|the) three (?:locales|languages)/gu,
        'in the configured languages'
      ]
    ]
  },
  {
    files: ['docs/i18n.md', 'docs/seo/publication.md'],
    hasI18n: true,
    rules: [
      [
        /in (?:its|the) three (?:locales|languages)/gu,
        'in the configured languages'
      ]
    ]
  },
  {
    files: ['docs/testing.md'],
    modes: ['server'],
    hasSeo: true,
    hasI18n: true,
    rules: [
      [
        /in (?:its|the) three (?:locales|languages)/gu,
        'in the configured languages'
      ]
    ]
  },
  {
    files: ['AGENTS.md'],
    hasI18n: true,
    rules: [['the three locales it', 'the languages it']]
  },
  {
    files: ['docs/i18n.md'],
    rules: [['the three locales of', 'the languages of']]
  },
  {
    files: ['AGENTS.md', 'docs/seo.md'],
    hasI18n: true,
    rules: [['i18n/{pt,en,es}.json', 'i18n/{locale}.json']]
  },
  {
    files: ['README.md'],
    hasTheme: true,
    rules: [['home page at /en, captured', 'home page, captured']]
  },
  {
    files: ['README.md'],
    modes: ['server'],
    hasSeo: true,
    rules: [['content-language: en\n', 'content-language: <language tag>\n']]
  },
  {
    files: ['docs/i18n.md'],
    hasSeo: false,
    rules: [
      [
        'to preserve pt-BR, en-US and es-ES in HTML',
        'to set language tags in HTML'
      ]
    ]
  }
]

function pathRules(prefix: string): ProfileRuleGroup[] {
  return [
    {
      files: ['README.md'],
      modes: ['static'],
      rules: [[/\/(?:pt|en|es)(?=\/)/gu, prefix]]
    },
    {
      files: ['README.md'],
      modes: ['server'],
      hasSeo: true,
      expectedMatches: 4,
      rules: [[/\/(?:pt|en|es)(?=\/)/gu, prefix]]
    },
    {
      files: ['docs/i18n.md'],
      modes: ['server'],
      hasSeo: true,
      rules: [[/\/(?:pt|en|es)(?=\/)/gu, prefix]]
    },
    {
      files: ['docs/security.md'],
      modes: ['server'],
      expectedMatches: 2,
      rules: [[/\/(?:pt|en|es)(?=\/)/gu, prefix]]
    },
    {
      files: ['docs/seo/indexes.md', 'docs/seo/sitemap.md'],
      rules: [[/\/(?:pt|en|es)(?=\/)/gu, prefix]]
    },
    {
      files: ['docs/seo/markdown.md'],
      modes: ['server'],
      expectedMatches: 13,
      rules: [[/\/(?:pt|en|es)(?=\/)/gu, prefix]]
    },
    {
      files: ['README.md'],
      modes: ['server'],
      rules: [[/\/(?:pt|en|es)(?=[.`\s]|$)/gu, prefix || '/']]
    },
    {
      files: ['docs/seo/markdown.md'],
      modes: ['server'],
      expectedMatches: 2,
      rules: [[/\/(?:pt|en|es)(?=[.`\s]|$)/gu, prefix || '/']]
    }
  ]
}

export function describeConfiguredLanguages(options: ProfileText): string {
  const prefix = options.profile.hasI18n === false ? '' : '/{locale}'
  return applyProfileRules({
    ...options,
    groups: [...groups, ...pathRules(prefix)]
  })
}
