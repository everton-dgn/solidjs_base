import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import { editCatalog } from '../edit-template.ts'
import type { StagedContext } from '../types.ts'
import { catalogLanguage, readLocaleSettings } from './catalogs.ts'

const indent = 2
const copy = {
  privacy_preferences: {
    en: 'Use your browser settings to review or clear the data this application stores on your device.',
    es: 'Usa los ajustes del navegador para revisar o borrar los datos que esta aplicación guarda en tu dispositivo.',
    pt: 'Use as configurações do navegador para consultar ou apagar os dados que esta aplicação guarda no seu dispositivo.'
  },
  privacy_description: {
    en: 'Learn about browser preferences and links to external sites.',
    es: 'Consulta información sobre las preferencias del navegador y los enlaces a sitios externos.',
    pt: 'Saiba mais sobre as preferências do navegador e os links para sites externos.'
  },
  about_purpose: {
    en: 'Solid Base provides routing, reusable components and automated tests. You can adapt the pages and components to your project. Each page has its own route, so you can share its address or open it directly. The contact page explains what to include when reporting a problem. The privacy page describes how your browser handles preferences and what happens when you follow a link to another website.',
    es: 'Solid Base ofrece rutas, componentes reutilizables y pruebas automatizadas. Puedes adaptar las páginas y los componentes a tu proyecto. Cada página tiene su propia ruta, de modo que puedes compartir su dirección o abrirla directamente. La página de contacto explica qué información incluir al comunicar un problema. La página de privacidad describe cómo gestiona el navegador tus preferencias y qué ocurre al seguir un enlace a otro sitio.',
    pt: 'Solid Base oferece rotas, componentes reutilizáveis e testes automatizados. Você pode adaptar as páginas e os componentes ao seu projeto. Cada página tem sua própria rota. Você pode compartilhar o endereço ou abri-lo diretamente no navegador. A página de contato explica quais informações incluir ao relatar um problema. Na página de privacidade, você encontra informações sobre as preferências do navegador e os links para outros sites.'
  },
  home_description: {
    en: 'Start your next project with {framework}, {toolchain} and {language}. Bookmark any page or share its address with someone else.',
    es: 'Empieza tu proyecto con {framework}, {toolchain} y {language}. Puedes guardar las páginas en tus favoritos o compartir su dirección.',
    pt: 'Comece seu projeto com {framework}, {toolchain} e {language}. Você pode salvar as páginas nos favoritos ou compartilhar o endereço delas.'
  }
}
export function configureLocaleCopy({
  stage,
  profile,
  write
}: StagedContext): void {
  const settings = readLocaleSettings(stage)
  for (const locale of settings.locales) {
    const seed = catalogLanguage(locale)
    for (const [page, keys] of [
      [
        'privacy',
        [
          'privacy_preferences',
          ...(profile.hasSeo === false
            ? ([] as const)
            : (['privacy_description'] as const))
        ]
      ],
      ['about', ['about_purpose']],
      ['(home)', ['home_description']]
    ] as const) {
      const file = `src/routes/(base)/${page}/i18n/${locale}.json`
      const content = readFileSync(path.join(stage, file), 'utf8')
      const data = parse(record(string(), string()), JSON.parse(content))
      for (const key of keys) {
        editCatalog({ file, catalog: data, key, value: copy[key][seed] })
      }
      write({ file, content: `${JSON.stringify(data, null, indent)}\n` })
    }
  }
}
