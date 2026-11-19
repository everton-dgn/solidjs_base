import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import {
  catalogLanguage,
  readLocaleSettings
} from '../configureLocales/catalogs.ts'
import { editCatalog } from '../edit-template.ts'
import { removeSeoConventions } from '../removeSeoConventions/index.ts'
import { removeSeoGuideCopy } from '../removeSeoGuideCopy/index.ts'

const aboutSource = {
  en: 'The repository includes installation instructions and guides to architecture and testing.',
  pt: 'O repositório inclui instruções de instalação e guias de arquitetura e testes.',
  es: 'El repositorio incluye instrucciones de instalación y guías de arquitectura y pruebas.'
}
const homeFeatures = {
  en: 'Visit the application pages using the navigation links.',
  pt: 'Use os links de navegação para visitar as páginas da aplicação.',
  es: 'Usa los enlaces de navegación para visitar las páginas de la aplicación.'
}
const indent = 2
export function removeSeoCopy(stage: string): void {
  for (const locale of readLocaleSettings(stage).locales) {
    const about = aboutSource[catalogLanguage(locale)]
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
        editCatalog({
          file,
          catalog: data,
          key: 'home_features',
          value: homeFeatures[catalogLanguage(locale)]
        })
      } else {
        const prefix = page === '[...404]' ? 'notFound' : page
        editCatalog({ file, catalog: data, key: `${prefix}_description` })
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
