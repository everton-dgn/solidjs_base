import { editTemplate } from '../edit-template.ts'

type TestFile = { file: string; text: string; hasSeo: boolean }
const seam = '@evertondgn/solid-runtime/i18n/locale'
export function configurePlainTest({
  file,
  hasSeo,
  text: source
}: TestFile): string {
  let text = source
  const edit = (pattern: RegExp | string, replacement: string) => {
    text = editTemplate({ file, text, pattern, replacement })
  }
  if (file.endsWith('/UiKit.e2e.test.ts')) {
    edit(/name: 'Localized page'/u, "name: 'Page', exact: true")
    edit(/name: 'Alternate language page'/u, "name: 'Page link'")
  }
  if (file.endsWith('configureServerErrors.messages.node.test.ts')) {
    edit(
      /import \{\n {2}baseLocale,[\s\S]*?from '@paraglide\/server.js'\n/u,
      `import { baseLocale } from '${seam}'\n`
    )
    edit(/const message = [\s\S]*?(?=describe\()/u, '')
    edit(/ {2}it\.each\(locales\)\([\s\S]*?\n {2}\)\n/u, '')
    edit(
      / {2}it\.each\(locales\)\('accepts explicit locale[\s\S]*?\n {2}\}\)/u,
      `  it('accepts the configured language', () => {
    expect(publicErrorMessage(baseLocale)).toBe(m.configureServerErrors_message())
  })`
    )
    edit(/\n {2}\/\/ The error hook[\s\S]*?\n {2}\}\)\n/u, '\n')
    edit('outside the Paraglide request context', 'in the configured language')
    edit('message(baseLocale)', 'm.configureServerErrors_message()')
  }
  if (file.endsWith('/llms.txt.node.test.ts')) {
    edit(
      /import \{ baseLocale, getLocale, locales \}[^\n]+\nimport \{ paraglideMiddleware \}[^\n]+/u,
      `import { baseLocale } from '${seam}'`
    )
    edit(
      /const alternate = [\s\S]*?(?=const INDEX_LANGUAGE)/u,
      'const BASE_DESCRIPTION = m.site_description()\n'
    )
    edit(/function inLocaleContext[\s\S]*?(?=describe\()/u, '')
    edit(
      /publishes the same index inside and outside a localized request context/u,
      'publishes the description in the configured language'
    )
    edit(
      /const baseResponse = [\s\S]*?(?= {4}expect\(response.headers)/u,
      'const response = await GET()\n    await expect(response.text()).resolves.toContain(BASE_DESCRIPTION)\n'
    )
  }
  if (file.endsWith('/middleware.node.test.ts')) {
    edit(
      /^vi.mock\(import\('@evertondgn\/solid-runtime\/i18n\/locale'\)[^\n]+\n/mu,
      ''
    )
    if (hasSeo) {
      edit(/^const ERROR_PAGE_LOG =\n[^\n]+\n/mu, '')
      edit(/ {8}'content-language': locale,\n/u, '')
      edit(/getLocale, shouldRedirect/u, 'getLocale')

      edit(/ {2}it\('contains a localization failure[\s\S]*?\n {2}\}\)\n/u, '')
      edit(/ {2}\/\/ Without a locale prefix[\s\S]*?\n {2}\}\)\n/u, '')
    }
  }
  if (file.endsWith('/markdownContent.protocol.node.test.ts')) {
    edit(/ {8}'content-language': alternate,\n/u, '')
    edit(
      / {6}expect\(\{/u,
      "      expect(response.headers.has('content-language')).toBe(false)\n      expect({"
    )
    edit(/const HTTP_REDIRECT = 307\n/u, '')
    edit(
      /const initial = [\s\S]*?(?= {6}const response =)/u,
      "const localized = request({ path: '/', method })\n"
    )
    edit(
      'localizes %s before returning an unsupported representation',
      'returns an unsupported representation for %s'
    )
  }
  if (
    file.endsWith('SiteContent.dom.test.tsx') ||
    file.endsWith('ErrorFallback.dom.test.tsx')
  ) {
    edit(/^import \{ baseLocale \}[^\n]+\n/mu, '')
    edit(/`\/\$\{baseLocale\}`/u, "'/'")
    if (file.endsWith('SiteContent.dom.test.tsx')) {
      for (const route of ['about', 'contact', 'privacy']) {
        edit(`\`/\${baseLocale}/${route}\``, `'/${route}'`)
      }
    }
  }
  if (file.endsWith('/requestJson.node.test.ts')) {
    edit(/\/\/ Without the paraglide locale context[^\n]+\n/u, '')
  }
  return text
}
