import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

const locales = {
  en: [
    'Pages are available in English, Portuguese and Spanish.',
    'The repository includes installation instructions and guides to architecture and testing.'
  ],
  pt: [
    'As páginas estão disponíveis em português, inglês e espanhol.',
    'O repositório inclui instruções de instalação e guias de arquitetura e testes.'
  ],
  es: [
    'Las páginas están disponibles en español, inglés y portugués.',
    'El repositorio incluye instrucciones de instalación y guías de arquitectura y pruebas.'
  ]
} as const
const indent = 2
export function removeSeoCopy(stage: string): void {
  for (const [locale, [home, about]] of Object.entries(locales)) {
    for (const page of ['(home)', 'about']) {
      const file = path.join(
        stage,
        'src/routes/(base)',
        page,
        'i18n',
        `${locale}.json`
      )
      const data = parse(
        record(string(), string()),
        JSON.parse(readFileSync(file, 'utf8'))
      )
      if (page === '(home)') {
        delete data.home_seoTitle
        data.home_features = home
      } else {
        data.about_source = about
      }
      writeFileSync(file, `${JSON.stringify(data, null, indent)}\n`)
    }
  }
  const docs = readdirSync(path.join(stage, 'docs'), {
    recursive: true,
    encoding: 'utf8'
  })
  const featureText =
    /\b(?:seo|markdown(?:Content)?|sitemaps?|robots\.txt|llms(?:-full)?\.txt|JSON-LD|canonical|hreflang|open graph|schema-dts|mdream)\b/iu
  for (const file of [
    'README.md',
    'AGENTS.md',
    ...docs
      .filter(name => name.endsWith('.md'))
      .map(name => path.join('docs', name))
  ]) {
    const target = path.join(stage, file)
    const blocks =
      readFileSync(target, 'utf8')
        .trimEnd()
        .match(/^```[^\n]*\n[\s\S]*?^```$|[^\n]+(?:\n(?!\n|```)[^\n]+)*/gmu) ??
      []
    writeFileSync(
      target,
      `${blocks.filter(block => !featureText.test(block)).join('\n\n')}\n`
    )
  }
}
