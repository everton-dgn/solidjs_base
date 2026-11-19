import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'

import { array, object, parse, record, string } from 'valibot'

import type { GenerationContext } from './generate.ts'
import { rewriteKnip } from './rewrite.ts'

const indent = 2
const catalogSchema = record(string(), string())
const staticFiles = new URL('../dist/static/', import.meta.url)

function removeServerFiles(stage: string): void {
  const source = new URL('../dist/features.json', import.meta.url)
  const spec = object({ serverOnly: array(string()) })
  const { serverOnly } = parse(spec, JSON.parse(readFileSync(source, 'utf8')))
  for (const file of serverOnly) rmSync(path.join(stage, file), { force: true })
}

function staticCatalogs(stage: string, theme?: boolean): void {
  const messages = {
    en: {
      home_features:
        'The application includes localized pages and UI components with automated tests.',
      home_description:
        'Start your next project with {framework}, {toolchain} and {language}.',
      about_purpose:
        'This project demonstrates routing, translated content and automated tests for a prerendered application. You can adapt the pages and components to your own product.',
      privacy_preferences:
        'The page address includes the selected language, such as /en, /pt or /es.',
      storage:
        ' The application saves your display preference in local storage on this device.'
    },
    es: {
      home_features:
        'La aplicación incluye páginas traducidas y componentes de interfaz con pruebas automatizadas.',
      home_description:
        'Empieza tu proyecto con {framework}, {toolchain} y {language}.',
      about_purpose:
        'El proyecto muestra las rutas, los textos traducidos y las pruebas de una aplicación prerenderizada. Puedes adaptar las páginas y los componentes a tu producto.',
      privacy_preferences:
        'La dirección de la página incluye el idioma seleccionado, como /es, /pt o /en.',
      storage:
        ' La aplicación guarda tu preferencia de apariencia en el almacenamiento local de este dispositivo.'
    },
    pt: {
      home_features:
        'A aplicação inclui páginas traduzidas e componentes de interface com testes automatizados.',
      home_description:
        'Comece seu projeto com {framework}, {toolchain} e {language}.',
      about_purpose:
        'O projeto mostra rotas, conteúdo traduzido e testes de uma aplicação pré-renderizada. Você pode adaptar as páginas e os componentes ao seu produto.',
      privacy_preferences:
        'O endereço da página inclui o idioma escolhido, como /pt, /en ou /es.',
      storage:
        ' A aplicação guarda sua preferência de aparência no armazenamento local deste dispositivo.'
    }
  }
  for (const [locale, text] of Object.entries(messages)) {
    for (const [route, update] of Object.entries({
      '(home)': {
        home_features: text.home_features,
        home_description: text.home_description
      },
      about: { about_purpose: text.about_purpose },
      privacy: {
        privacy_preferences:
          text.privacy_preferences + (theme === false ? '' : text.storage)
      }
    })) {
      const file = path.join(
        stage,
        'src/routes/(base)',
        route,
        'i18n',
        `${locale}.json`
      )
      const catalog = parse(
        catalogSchema,
        JSON.parse(readFileSync(file, 'utf8'))
      )
      writeFileSync(
        file,
        `${JSON.stringify({ ...catalog, ...update }, null, indent)}\n`
      )
    }
  }
}

export function configureStatic(
  stage: string,
  context: GenerationContext
): void {
  const { profile, write, pkg } = context
  if (profile.mode !== 'static') return
  removeServerFiles(stage)
  cpSync(new URL('files/', staticFiles), stage, { recursive: true })
  const edit = (file: string) => (pattern: RegExp, replacement: string) => {
    const content = readFileSync(path.join(stage, file), 'utf8')
    if (!pattern.test(content)) {
      throw new Error(`Missing static mode edit in ${file}`)
    }
    write(file, content.replace(pattern, replacement))
  }
  if (profile.theme !== false) {
    cpSync(new URL('theme/', staticFiles), stage, { recursive: true })
    const helper = 'src/tests/helpers/clearThemeCookie/index.ts'
    rmSync(path.join(stage, helper))
    edit(
      'src/components/molecules/ThemeToggle/__tests__/ThemeToggle.browser.test.tsx'
    )(/^import \{ clearThemeCookie[^\n]+\n/mu, '')
    edit(
      'src/components/molecules/ThemeToggle/__tests__/ThemeToggle.browser.test.tsx'
    )(/clearThemeCookie/gu, "() => localStorage.removeItem('app-theme')")
  }
  const vite = 'vite.config.ts'
  edit(vite)(/^import \{ SECURITY_HEADERS[^\n]+\n/mu, '')
  edit(vite)(
    /^ *serverSetup: [^\n]*\n *e2e: \{[\s\S]*?\n *\},\n/mu,
    "  output: 'static',\n"
  )
  edit(vite)(/^ *securityHeaders: SECURITY_HEADERS,\n/mu, '')
  edit(vite)(/,\n {2}\/\/ Without fallthrough,[\s\S]*?\n\}\)/u, '\n})')
  rewriteKnip(stage)
  staticCatalogs(stage, profile.theme)
  pkg.scripts.start = 'node tooling/testing/serve-public.ts'
  pkg.scripts['test:e2e'] = 'vp run playwright test'
  delete pkg.scripts['test:e2e:production']
  const knip = 'tooling/knip.ts'
  if (existsSync(path.join(stage, knip))) {
    edit(knip)(
      /'tooling\/css\/check.ts'/u,
      "'tooling/testing/serve-public.ts',\n    'tooling/css/check.ts'"
    )
  }
}
