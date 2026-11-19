import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { guideFiles } from '../prepared-guides.ts'
import type { StagedContext } from '../types.ts'

const settings = 'project.inlang/settings.json'
const messages = 'src/constants/messages/index.ts'

function plainGuide(source: string): string {
  return source
    .replaceAll('@paraglide/messages.js', '@/constants/messages/index.ts')
    .replace(/^- \[Translations\]\(docs\/i18n\.md\)\n/mu, '')
    .replace(
      /setup, in the locale of the request, as described in\n {2}\[Locale of the public message\]\(#locale-of-the-public-message\)\./u,
      'setup.'
    )
    .replaceAll(
      /^## (?:Generated i18n files|Translations|Locale of the public message)\n[\s\S]*?(?=^## |(?![\s\S]))/gmu,
      ''
    )
    .replace(
      /^## Application packages\n\n- URL helpers,[\s\S]*?(?=^## )/mu,
      '## Application packages\n\nUse the application message functions in `src/constants/messages/index.ts`.\n\n'
    )
    .replace(
      /\. `i18n:generate` runs the compiled\n {2}generator from the package\./u,
      '.'
    )
    .replace(
      /they skip `i18n:generate` and\n {2}the CSS lint/u,
      'they skip the CSS lint'
    )
    .replace(
      /\. The `\.md` files come in\n {2}per locale; when changing the Paraglide `urlPatterns`, review those patterns\./u,
      '.'
    )
    .replaceAll(
      /^\|[^\n]*(?:docs\/i18n\.md|vp run i18n:generate)[^\n]*\n/gmu,
      ''
    )
    .replaceAll(', `i18n` and `paraglide`', '')
    .replaceAll(', `i18n`, `paraglide`', '')
    .replaceAll('in the three locales, ', '')
    .replace(
      /Keep Paraglide, message-format and the Solid libraries/u,
      'Keep the Solid libraries'
    )
    .replace(
      /The catalogs are in\n`i18n\/\{pt,en,es\}\.json` next to those files\./u,
      `Read the text from \`${messages}\`.`
    )
    .replace(
      /, and the production i18n test\nchecks that each body stays only in the route module\./u,
      '.'
    )
    .replace(
      /With i18n, each page produces[\s\S]*?\(\.\.\/i18n\.md(?:#seo-indexes)?\)\./u,
      'Each page has one URL. The static inventory is split by URL count and by the UTF-8 size of the complete XML.'
    )
    .replace(
      /llms\.txt uses\n`i18n\/locale-context`:[\s\S]*?without manual edits\./u,
      'The index uses the language configured in `vite.config.ts`.'
    )
    .replace(
      /That is why\n {2}the preset writes[\s\S]*?without these headers\./u,
      'Keep static file patterns distinct so responses receive the expected headers.'
    )
    .replace(
      /The tests check the interface in its three languages\./u,
      'The tests exercise the application interface.'
    )
}

function describeConfiguredLanguages(text: string, hasI18n: boolean): string {
  const prefix = hasI18n ? '/{locale}' : ''
  return text
    .replace(
      /The root redirects to a locale, such as `\/en`\.\nUse the language button[^.]+\./u,
      'Open the home page and follow a link in the navigation.'
    )
    .replace(
      /the home page answers on `\/pt`,\n`\/en` and `\/es`,/u,
      'the home page renders at the application root,'
    )
    .replace(
      /`project.inlang\/settings.json` defines `pt`, `en` and `es`, with English as the\nbase locale\./u,
      '`project.inlang/settings.json` defines the languages and the base locale.'
    )
    .replace(
      /keeps `i18n\/pt.json`, `i18n\/en.json` and\n`i18n\/es.json`/u,
      'keeps a catalog for each configured locale'
    )
    .replace(
      /to preserve pt-BR, en-US and es-ES in HTML, Open\nGraph and JSON-LD/u,
      'to set language tags for HTML, Open Graph and JSON-LD'
    )
    .replace(
      /uses English and `\/en` URLs/u,
      'uses the base language and its URLs'
    )
    .replace(
      /the three locales and `x-default` pointing to English/u,
      'the configured locales and `x-default` pointing to the base locale'
    )
    .replace(
      /The messages of the example must exist in the catalog of the consumer in the\nthree locales\./u,
      'Define the example messages before using them.'
    )
    .replaceAll(
      /in (?:its|the) three (?:locales|languages)/gu,
      'in the configured languages'
    )
    .replaceAll('the three locales it', 'the languages it')
    .replaceAll('the three locales of', 'the languages of')
    .replaceAll('i18n/{pt,en,es}.json', 'i18n/{locale}.json')
    .replaceAll(/\/pt(?=[/.`])/gu, prefix)
}

export function configureLocaleGuides({
  stage,
  profile,
  write
}: StagedContext): void {
  for (const file of ['AGENTS.md', ...guideFiles(stage)]) {
    if (!existsSync(path.join(stage, file))) continue
    const input = readFileSync(path.join(stage, file), 'utf8')
    let text = input
    if (file === 'README.md') {
      text = text.replace(
        /^### The same page in three languages\n[\s\S]*?(?=^### |^## |(?![\s\S]))/mu,
        profile.hasI18n === false
          ? ''
          : `### Application languages\n\nConfigure languages in \`${settings}\`.\n\n`
      )
      text = text.replace(
        /^\| Three languages[^\n]*\n/mu,
        profile.hasI18n === false
          ? ''
          : '| Languages | Configured language catalogs and routes | [I18n](src/tests/pages/I18n) | [I18n](docs/i18n.md) |\n'
      )
    }
    if (profile.hasI18n === false) text = plainGuide(text)
    text = describeConfiguredLanguages(text, profile.hasI18n !== false)
    if (text !== input) write({ file, content: text })
  }
}
