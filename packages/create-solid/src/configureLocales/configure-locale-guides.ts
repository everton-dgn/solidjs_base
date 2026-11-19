import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  applyProfileRules,
  type ProfileRuleGroup
} from '../apply-profile-rules.ts'
import { editTemplate } from '../edit-template.ts'
import { guideFiles } from '../prepared-guides.ts'
import type { StagedContext } from '../types.ts'
import { readLocaleSettings } from './catalogs.ts'
import { configurePlainGuide } from './configure-plain-guide.ts'
import { describeConfiguredLanguages } from './describe-configured-languages.ts'

const settings = 'project.inlang/settings.json'
const singleLanguageRules: readonly ProfileRuleGroup[] = [
  {
    files: ['README.md'],
    modes: ['server'],
    hasSeo: true,
    rules: [
      [
        'The application provides localized pages and navigation.',
        'The application includes a home page and navigation.'
      ]
    ]
  },
  {
    files: ['README.md'],
    modes: ['server'],
    hasTheme: true,
    rules: [['language and theme switchers', 'a theme switcher']]
  },
  {
    files: ['README.md'],
    modes: ['server'],
    hasTheme: false,
    rules: [['a language switcher, ', '']]
  },
  {
    files: ['README.md'],
    modes: ['server'],
    hasTheme: false,
    expectedMatches: 2,
    rules: [['the toasts and `DropdownMenu`', 'and the toasts']]
  },
  {
    files: ['docs/architecture.md'],
    hasTheme: true,
    rules: [
      ['`ThemeToggle`\n  and `LocaleSwitcher` build', '`ThemeToggle` builds']
    ]
  },
  {
    files: ['docs/architecture.md'],
    hasTheme: false,
    rules: [
      [
        /`LocaleSwitcher`\s+builds on `Button` and `DropdownMenu`,\s+(?=`OutdatedPageNotice`)/u,
        ''
      ],
      [
        '`DropdownMenu`, which receives\n  a ready trigger, and `ToastProvider` stay',
        '`ToastProvider` stays'
      ]
    ]
  },
  {
    files: ['AGENTS.md'],
    hasTheme: false,
    rules: [['`DropdownMenu/constants.ts`', '`Dialog/constants.ts`']]
  }
]
export function configureLocaleGuides({
  stage,
  profile,
  write
}: StagedContext): void {
  const isSingleLocale = readLocaleSettings(stage).locales.length === 1
  for (const file of ['AGENTS.md', ...guideFiles(stage)]) {
    if (!existsSync(path.join(stage, file))) continue
    const input = readFileSync(path.join(stage, file), 'utf8')
    let text = input
    if (profile.hasI18n !== false && file === 'docs/seo.md') {
      text = editTemplate({
        file,
        text,
        pattern: 'the three available locales',
        replacement: 'the configured locales'
      })
    }
    if (file === 'docs/i18n.md' && profile.hasI18n !== false) {
      text = editTemplate({
        file,
        text,
        pattern: / {4}pt\.json\n {4}en\.json\n {4}es\.json/u,
        replacement: '    {locale}.json'
      })
      text = editTemplate({
        file,
        text,
        pattern:
          /Use the same set of keys and parameters in the three files\.[\s\S]*?The\ncompiler generates/u,
        replacement:
          'Use the same keys and parameters in every catalog. The compiler generates'
      })
      text = editTemplate({
        file,
        text,
        pattern: "{ locale: 'es' }",
        replacement: '{ locale: baseLocale }'
      })
      if ((profile.mode ?? 'server') === 'server') {
        text = editTemplate({
          file,
          text,
          pattern: 'and finally `en`',
          replacement: 'and finally the base locale'
        })
      }
    }
    if (file === 'README.md') {
      text = editTemplate({
        file,
        text,
        pattern:
          /^### The same page in three languages\n[\s\S]*?(?=^### |^## |(?![\s\S]))/mu,
        replacement:
          profile.hasI18n === false
            ? ''
            : `### Application languages\n\nConfigure languages in \`${settings}\`.\n\n`
      })
      if ((profile.mode ?? 'server') === 'server') {
        text = editTemplate({
          file,
          text,
          pattern: /^\| Three languages[^\n]*\n/mu,
          replacement:
            profile.hasI18n === false
              ? ''
              : '| Languages | Configured language catalogs and routes | [I18n](src/tests/pages/I18n) | [I18n](docs/i18n.md) |\n'
        })
      }
    }
    if (isSingleLocale) {
      text = applyProfileRules({
        file,
        text,
        profile,
        groups: singleLanguageRules
      })
    }
    if (profile.hasI18n === false) {
      if (file === 'docs/seo.md') {
        text = editTemplate({
          file,
          text,
          pattern:
            /`og:locale:alternate` lists the other locales,[\s\S]*?the three available locales\./u,
          replacement: '`WebSite.inLanguage` declares the application language.'
        })
        text = editTemplate({
          file,
          text,
          pattern:
            /Indexable pages\npublish `hreflang`[\s\S]*?stays at the site root\./u,
          replacement:
            'The canonical URL identifies the page. The organization uses the site root.'
        })
      }
      text = configurePlainGuide({ file, text, profile })
    }
    text = describeConfiguredLanguages({
      text,
      file,
      profile
    })
    if (text !== input) write({ file, content: text })
  }
}
