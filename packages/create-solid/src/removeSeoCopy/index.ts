import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import { editCatalog } from '../edit-template.ts'
import { removeSeoConventions } from '../removeSeoConventions/index.ts'
import { removeSeoGuideCopy } from '../removeSeoGuideCopy/index.ts'

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
    for (const page of ['(home)', 'about', 'contact', 'privacy', '[...404]']) {
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
        editCatalog({ file, catalog: data, key: 'home_seoTitle' })
        editCatalog({ file, catalog: data, key: 'home_features', value: home })
      } else {
        const prefix = page === '[...404]' ? 'notFound' : page
        editCatalog({ file, catalog: data, key: `${prefix}_description` })
        if (page === '[...404]') {
          editCatalog({ file, catalog: data, key: 'notFound_title' })
        }
        if (page === 'about') {
          editCatalog({
            file,
            catalog: data,
            key: 'about_source',
            value: about
          })
        }
      }
      if (Object.keys(data).length === 0) {
        rmSync(file)
        continue
      }
      writeFileSync(file, `${JSON.stringify(data, null, indent)}\n`)
    }
  }
  const agents = path.join(stage, 'AGENTS.md')
  writeFileSync(agents, removeSeoConventions(readFileSync(agents, 'utf8')))
  removeSeoGuideCopy(stage)
}
