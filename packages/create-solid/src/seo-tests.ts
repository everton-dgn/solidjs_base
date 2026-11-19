import { readdirSync } from 'node:fs'
import path from 'node:path'

type Edit = (file: string, replace: (text: string) => string) => void

export function removeSeoTests(stage: string, edit: Edit): void {
  edit('playwright.config.ts', text =>
    text.replace(/,\n {4}markdown:[^\n]*\n {4}publicationLoad:[^\n]*/u, '')
  )
  edit('src/middleware/__tests__/middleware.node.test.ts', text =>
    text.replace(
      / {2}\/\/ covers sitemap.xml and robots.txt; here only the chaining matters\.\n/u,
      ''
    )
  )
  for (const file of [
    'src/tests/pages/Home/Home.production.e2e.test.ts',
    'src/tests/pages/I18n/I18n.e2e.test.ts'
  ]) {
    edit(file, text =>
      text
        .replaceAll(
          /^ *await expect\(page\.locator\('head link\[rel="canonical"\]'\)\)[^\n]*\n/gmu,
          ''
        )
        .replace(
          /^ *await expect\(page\.locator\('head meta\[name="robots"\]'\)\)\.toHaveAttribute\(\n[^\n]*\n[^\n]*\n *\)\n/mu,
          ''
        )
        .replace(/^ *await expect\(page\)\.toHaveTitle\([^\n]*\n/mu, '')
    )
  }
  edit('src/tests/pages/OutsideError/OutsideError.e2e.test.ts', text =>
    text.replace("['/robots.txt', '/_server/fixture']", "['/_server/fixture']")
  )
  for (const file of [
    'src/tests/pages/UiKit/UiKit.e2e.test.ts',
    'src/tests/fixtures/e2e/routes/(base)/ui-kit/index.tsx'
  ]) {
    edit(file, text =>
      text
        .replace('/robots.txt', '/favicon/favicon.ico')
        .replace('Robots file', 'Site icon')
    )
  }
  edit(
    'src/components/organisms/ErrorFallback/__tests__/ErrorFallback.dom.test.tsx',
    text => {
      let result = text
        .replace(
          /function readMeta[\s\S]*?(?=describe\('navigation after a failure')/u,
          ''
        )
        .replace(', Errored', '')
      if (!result.includes('createSignal<')) {
        result = result
          .replace(/^import \{ createSignal \}[^\n]*\n/mu, '')
          .replace(/^import type \{ ErrorFallbackKind[^\n]*\n/mu, '')
      }
      if (!result.includes('m.')) {
        result = result.replace(/^import \{ m \}[^\n]*\n/mu, '')
      }
      return result.trimStart()
    }
  )
  const fixtures = 'src/tests/fixtures/e2e/routes'
  for (const item of readdirSync(path.join(stage, 'src/tests'), {
    recursive: true,
    encoding: 'utf8'
  })) {
    const file = path.join('src/tests', item)
    if (file.startsWith(fixtures) && file.endsWith('.tsx')) {
      edit(file, text => {
        if (!text.includes('info: {')) return text
        return text.replace(
          /export const route = \{\n {2}info: \{[\s\S]*?\n\}(?<constraint> satisfies RouteDefinition)?\n\n/u,
          'export const route = {}$<constraint>\n\n'
        )
      })
    }
  }
  edit('src/middleware/__tests__/middleware.node.test.ts', text =>
    text
      .replace(
        /^describe\('containment of the Markdown adapter'[\s\S]*?(?=^describe\('responses with immutable headers')/mu,
        ''
      )
      .replaceAll(
        /^import \{ (?:MAX_HTML_BYTES|isPublicError|Router) \}[^\n]*\n/gmu,
        ''
      )
      .replace(/^import \{ getLocale, shouldRedirect \}[^\n]*\n/mu, '')
      .replace('middleware, { createMiddleware }', 'middleware')
      .replace(/^const PUBLIC_MESSAGE_EN[^\n]*\n/mu, '')
      .replace(/^const ERROR_PAGE_LOG =\n[^\n]+\n/mu, '')
      .replace(/^\/\/ The inner chain[^\n]+\n[^\n]+\n/mu, '')
      .replace(/, like sitemap.xml and\n\/\/ robots.txt,/u, ',')
  )
  edit(
    'src/tests/pages/I18n/I18n.production.e2e.test.ts',
    text =>
      `${text
        .replace(/^test\('isolates concurrent HTML and Markdown[\s\S]*/mu, '')
        .replace(/^import \{ readSiteOrigin \}[^\n]+\n/mu, '')
        .replaceAll(/^const (?:REQUESTS|ALTERNATE_LINKS) = \d+\n/gmu, '')
        .replace(
          /^ *await expect\(page\.locator\('link\[rel="canonical"[\s\S]*?(?=^ *const header)/mu,
          ''
        )
        .replace(
          /^ *await expect\(page\)\.toHaveTitle\(language\.missing\)[\s\S]*?(?=^ *expect\(await isSameHeader)/mu,
          ''
        )
        .trimEnd()}\n`
  )
}
