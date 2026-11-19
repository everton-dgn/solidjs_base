import { readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'

export const middlewareTest = 'src/middleware/__tests__/middleware.node.test.ts'

export function configureMiddlewareTests({
  stage,
  profile,
  write
}: StagedContext): void {
  const file = middlewareTest
  let text = readFileSync(path.join(stage, file), 'utf8')
  const edit = (pattern: RegExp | string, replacement: string) => {
    text = editTemplate({ file, text, pattern, replacement: () => replacement })
  }
  const runtime = "from '@paraglide/runtime.js'"
  const functions = "import { m } from '@paraglide/messages.js'"
  if (profile.hasSeo === false) {
    edit(
      'import { createRequestEvent',
      `${functions}\nimport { baseLocale, locales } ${runtime}\nimport { createRequestEvent`
    )
  } else {
    edit(
      'import { getLocale, shouldRedirect }',
      `${functions}\nimport { baseLocale, getLocale, locales, shouldRedirect }`
    )
    edit("it.each(['pt', 'en', 'es'])", 'it.each(locales)')
    edit(
      /const PUBLIC_MESSAGE_EN = [^\n]+/u,
      'const baseMessage = m.configureServerErrors_message({}, { locale: baseLocale })'
    )
    text = text.replaceAll('PUBLIC_MESSAGE_EN', 'baseMessage')
    text = text.replaceAll("toBe('en')", 'toBe(baseLocale)')
    edit('}/en/about?version=2', `}/\${baseLocale}/about?version=2`)
  }
  edit(
    /const PUBLIC_MESSAGE_PT = [^\n]+/u,
    'const alternate = locales.find(locale => locale !== baseLocale) ?? baseLocale\nconst alternateMessage = m.configureServerErrors_message({}, { locale: alternate })'
  )
  text = text.replaceAll('PUBLIC_MESSAGE_PT', 'alternateMessage')
  text = text.replaceAll(/'\/(?:pt|en)[^']*'/gu, match => {
    const locale = match.startsWith("'/pt") ? 'alternate' : 'baseLocale'
    const suffix = match.slice("'/pt".length, -1)
    return `\`/\${${locale}}${suffix}\``
  })
  write({ file, content: text })
}
