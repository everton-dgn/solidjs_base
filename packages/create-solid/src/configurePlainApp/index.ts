import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { configureTestLabels } from '../configureLocales/browser-labels.ts'
import { readLocaleSettings } from '../configureLocales/catalogs.ts'
import { configureSingleBrowserTests } from '../configureLocales/single-browser-tests.ts'
import { configureSingleMenuTests } from '../configureLocales/single-menu-tests.ts'
import { configureMessages } from '../configureMessages/index.ts'
import { editTemplate } from '../edit-template.ts'
import {
  localMessageFolders,
  removeFeatureFiles
} from '../removeFeatureFiles/index.ts'
import type { StagedContext } from '../types.ts'
import { configurePlainTest } from './configure-plain-test.ts'

const messages = '@/constants/messages/index.ts'
const seam = '@evertondgn/solid-runtime/i18n/locale'
const hydration =
  'const locale = prepareClientLocale()\nif (locale.shouldHydrate) {\n'
type NamedEdit = { file: string; pattern: RegExp | string; replacement: string }

function configurePlainBrowserTests(context: StagedContext): void {
  if ((context.profile.mode ?? 'server') === 'server') {
    configureSingleBrowserTests(context)
    configureSingleMenuTests(context)
    configureTestLabels(context)
  }
}

export function configurePlainApp(context: StagedContext): void {
  const { stage, write } = context
  const { baseLocale } = readLocaleSettings(stage)
  const read = (file: string) => readFileSync(path.join(stage, file), 'utf8')
  const edit = (options: NamedEdit) =>
    write({
      file: options.file,
      content: editTemplate({ ...options, text: read(options.file) })
    })
  configurePlainBrowserTests(context)
  configureMessages(context)
  for (const folder of localMessageFolders(stage)) {
    const catalog = path.join(folder, `${baseLocale}.json`)
    if (existsSync(catalog)) rmSync(catalog)
  }
  removeFeatureFiles({ stage, disabled: ['i18n'] })
  edit({
    file: 'vite.config.ts',
    pattern: '  root: import.meta.dirname,',
    replacement: `  root: import.meta.dirname,\n  language: '${baseLocale}',`
  })
  edit({
    file: 'tsconfig.json',
    pattern: /,\n +"@paraglide\/\*":[^\n]+/u,
    replacement: ''
  })
  edit({
    file: 'tsconfig.node.json',
    pattern: /,\n +"project\.inlang\/paraglide\.config\.ts"/u,
    replacement: ''
  })
  edit({
    file: '.gitignore',
    pattern:
      /^\/\.paraglide\/\n\/paraglide\/\n\/project\.inlang\/cache\/\n\/project\.inlang\/\.gitignore\n/mu,
    replacement: ''
  })
  const knip = 'tooling/knip.ts'
  const configuration = read(knip)
  if (configuration.includes('@inlang/plugin-message-format')) {
    write({
      file: knip,
      content: configuration
        .replace(
          / {2}\/\/ server-only is virtual\.[^\n]*\n(?: {2}\/\/ [^\n]*\n)*/u,
          ''
        )
        .replace(/,? ?'@inlang\/plugin-message-format'/u, '')
    })
  }
  const router = 'src/router.ts'
  edit({
    file: router,
    pattern: /\nexport const \{ paths \} = Router\n/u,
    replacement: '\n'
  })
  const clientEntry = 'src/entry-client.tsx'
  if (read(clientEntry).includes(hydration)) {
    const [imports, body = ''] = read(clientEntry).split(hydration)
    if (!imports || !body.endsWith('}\n')) {
      throw new Error('Missing hydration body')
    }
    const content =
      imports.replace(/^import \{ prepareClientLocale \}[^\n]+\n/mu, '') +
      body
        .slice(0, -'}\n'.length)
        .replace(/^ +locale\.dispose\(\)\n/mu, '')
        .replaceAll(/^ {2}/gmu, '')
    write({ file: clientEntry, content })
  }
  for (const entry of readdirSync(path.join(stage, 'src'), {
    recursive: true,
    withFileTypes: true
  })) {
    if (!entry.isFile() || !/\.tsx?$/u.test(entry.name)) continue
    const file = path.relative(stage, path.join(entry.parentPath, entry.name))
    if (file === 'src/tests/helpers/testLocale/index.ts') {
      write({
        file,
        content: `const language = '${baseLocale}'\n\nexport const testLocale = {\n  hasPrefix: false,\n  base: language,\n  alternate: language,\n  locales: [language],\n  header: (_locale: string): string | undefined => undefined,\n  tag: (locale: string): string => locale,\n  path: (_locale: string, suffix: string): string =>\n    suffix.startsWith('/') ? suffix : \`/\${suffix}\`\n}\n`
      })
      continue
    }
    const original = read(file)
    let text = original
      .replaceAll('@paraglide/messages.js', messages)
      .replaceAll('@paraglide/runtime.js', seam)
      .replace(/^import \{ LocalizedLink \}[^\n]+\n/mu, '')
      .replaceAll(/<(?<close>\/?)LocalizedLink\b/gu, '<$<close>a')
      .replace(
        "href={props.kind === 'runtime' ? '' : paths}",
        "href={props.kind === 'runtime' ? '' : '/'}"
      )
      .replace(
        /^import \{ paths \} from '@\/router.ts'\n(?=[\s\S]*href=\{props.kind)/mu,
        ''
      )
      .replace(/^import \{ createLocaleNavigationGuard \}[^\n]+\n/mu, '')
      .replace(/^ +createLocaleNavigationGuard\(\)\n/mu, '')
      .replace(/^import \{ LOCALE_TAG_OVERRIDES \}[^\n]+\n/mu, '')
      .replace(/^ +localeTagOverrides: LOCALE_TAG_OVERRIDES,\n/mu, '')
      .replace(/^import \{ localeTag \}[^\n]+\n/mu, '')
    text = text
      .replace(/^import \{ delocalizePathname \}[^\n]+\n/mu, '')
      .replace(/,\n {2}transformUrl: delocalizePathname/u, '')
      .replace(
        'const pathname = delocalizePathname(url.pathname)',
        'const { pathname } = url'
      )
      .replaceAll(/delocalizePathname\((?<pathname>[\w.]+)\)/gu, '$<pathname>')
      .replace(/^import \{ localizeHref \}[^\n]+\n/mu, '')
      .replace(/localizeHref\(\{ href: (?<href>'[^']+') \}\)/u, '$<href>')
      .replace(
        "import { localizedRedirect } from '@evertondgn/solid-runtime/i18n/localized-redirect'",
        "import { redirect } from '@solidjs/web'"
      )
      .replace(
        /localizedRedirect\(\{ href: (?<href>'[^']+') \}\)/u,
        'redirect($<href>)'
      )
    const apply = (pattern: string | RegExp, replacement: string) => {
      text = editTemplate({ file, text, pattern, replacement })
    }
    if (file === 'src/constants/site/index.ts') {
      apply('localeTag(getLocale(), LOCALE_TAG_OVERRIDES)', 'getLocale()')
      const valueImport = `import { m } from '${messages}'`
      if (text.includes(valueImport)) {
        apply(valueImport, `import { m, type Locale } from '${messages}'`)
      } else {
        text = `import type { Locale } from '${messages}'\n${text}`
      }
      apply('get locale(): string', 'get locale(): Locale')
    }
    if (file.endsWith('/ui-kit/index.tsx')) {
      apply(' locale={alternate}', '')
      apply(/^import \{ baseLocale, locales \}[^\n]+\n/mu, '')
      apply(/^const alternate = [^\n]+\n/mu, '')
      apply(' shouldLocalize={false}', ' target="_self"')
      apply('Alternate language page', 'Page link')
      apply('Localized page', 'Page')
      apply(/^import \{ createLocalizedNavigate \}[^\n]+\n/mu, '')
      apply('import { useSearchParams', 'import { useNavigate, useSearchParams')
      apply('createLocalizedNavigate()', 'useNavigate()')
      apply(/navigate\(\{ href: (?<href>'[^']+') \}\)/u, 'navigate($<href>)')
      apply(
        /navigate\(\{ href: (?<href>'[^']+'), replace: true \}\)/u,
        'navigate($<href>, { replace: true })'
      )
    }
    if (file === 'src/infra/server/configureServerErrors/index.ts') {
      text = editTemplate({
        file,
        text,
        pattern: /^import \{ isLocale \}[^\n]+\n/mu,
        replacement: ''
      })
      text = editTemplate({
        file,
        text,
        pattern:
          /publicMessage: locale => \{\n {4}if \(!isLocale\(locale\)\)[^\n]+\n {4}return (?<message>[^\n]+)\n {2}\}/u,
        replacement: 'publicMessage: locale => $<message>'
      })
    }
    if (file === 'src/routes/(seo)/llms.txt/constants.ts') {
      apply('baseLocale, locales, type Locale', 'baseLocale')
      apply('languageName(locale: Locale)', 'languageName(locale: string)')
      apply(/const AVAILABLE_LANGUAGES = [\s\S]*?\n\)\n/u, '')
      apply(`Content is available in \${AVAILABLE_LANGUAGES}. `, '')
    }
    text = configurePlainTest({
      file,
      text,
      hasSeo: context.profile.hasSeo !== false
    })
    if (text !== original) write({ file, content: text })
  }
  if (existsSync(path.join(stage, 'project.inlang/settings.json'))) {
    throw new Error('Translation settings remain in the plain application')
  }
}
