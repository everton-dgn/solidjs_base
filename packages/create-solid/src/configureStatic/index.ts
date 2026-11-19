import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import { editCatalog, editTemplate } from '../edit-template.ts'
import type { StagedContext } from '../generate.ts'
import { distribution } from '../paths.ts'
import { removeFeatureFiles } from '../removeFeatureFiles/index.ts'
import { rewriteKnip } from '../rewrite.ts'

const indent = 2
const catalogSchema = record(string(), string())
const staticFiles = new URL('static/', distribution)

function staticCatalogs(stage: string, theme?: boolean): void {
  const messages = {
    en: {
      site_description:
        'A foundation for prerendered web applications with SolidJS, TypeScript and Vite+.',
      home_seoTitle: 'SolidJS Boilerplate | Prerendered web applications',
      about_source:
        'The repository includes installation instructions and guides to architecture and testing. You can use, modify, distribute and sell the code, including in commercial and closed-source projects.',
      home_features:
        'The application includes localized pages and UI components with automated tests.',
      home_description:
        'Start your next project with {framework}, {toolchain} and {language}.',
      about_purpose:
        'This project demonstrates routing, translated content and automated tests for a web application. You can adapt the pages and components to your own product.',
      privacy_preferences:
        'The page address includes the selected language, such as /en, /pt or /es.',
      storage:
        ' The application saves your display preference in local storage on this device.'
    },
    es: {
      site_description:
        'Una base para aplicaciones web prerenderizadas con SolidJS, TypeScript y Vite+.',
      home_seoTitle: 'SolidJS Boilerplate | Aplicaciones web prerenderizadas',
      about_source:
        'El repositorio incluye instrucciones de instalación y guías de arquitectura y pruebas. Puedes usar, modificar, distribuir y vender el código, incluso en proyectos comerciales y de código cerrado.',
      home_features:
        'La aplicación incluye páginas traducidas y componentes de interfaz con pruebas automatizadas.',
      home_description:
        'Empieza tu proyecto con {framework}, {toolchain} y {language}.',
      about_purpose:
        'El proyecto muestra las rutas, los textos traducidos y las pruebas de una aplicación web. Puedes adaptar las páginas y los componentes a tu producto.',
      privacy_preferences:
        'La dirección de la página incluye el idioma seleccionado, como /es, /pt o /en.',
      storage:
        ' La aplicación guarda tu preferencia de apariencia en el almacenamiento local de este dispositivo.'
    },
    pt: {
      site_description:
        'Uma base para aplicações web pré-renderizadas com SolidJS, TypeScript e Vite+.',
      home_seoTitle: 'SolidJS Boilerplate | Aplicações web pré-renderizadas',
      about_source:
        'O repositório inclui instruções de instalação e guias de arquitetura e testes. Você pode usar, modificar, distribuir e vender o código, inclusive em projetos comerciais e de código fechado.',
      home_features:
        'A aplicação inclui páginas traduzidas e componentes de interface com testes automatizados.',
      home_description:
        'Comece seu projeto com {framework}, {toolchain} e {language}.',
      about_purpose:
        'O projeto mostra rotas, conteúdo traduzido e testes de uma aplicação web. Você pode adaptar as páginas e os componentes ao seu produto.',
      privacy_preferences:
        'O endereço da página inclui o idioma escolhido, como /pt, /en ou /es.',
      storage:
        ' A aplicação guarda sua preferência de aparência no armazenamento local deste dispositivo.'
    }
  }
  for (const [locale, text] of Object.entries(messages)) {
    const siteFile = path.join(
      stage,
      'src/constants/site/i18n',
      `${locale}.json`
    )
    const site = parse(
      catalogSchema,
      JSON.parse(readFileSync(siteFile, 'utf8'))
    )
    editCatalog({
      file: siteFile,
      catalog: site,
      key: 'site_description',
      value: text.site_description
    })
    writeFileSync(siteFile, `${JSON.stringify(site, null, indent)}\n`)
    for (const [route, update] of Object.entries({
      '(home)': {
        home_seoTitle: text.home_seoTitle,
        home_features: text.home_features,
        home_description: text.home_description
      },
      about: {
        about_purpose: text.about_purpose,
        about_source: text.about_source
      },
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
      for (const [key, value] of Object.entries(parse(catalogSchema, update))) {
        editCatalog({ file, catalog, key, value })
      }
      writeFileSync(file, `${JSON.stringify(catalog, null, indent)}\n`)
    }
  }
}

export function configureStatic(context: StagedContext): void {
  const { stage } = context
  const { profile, write, pkg } = context
  if (profile.mode !== 'static' && profile.mode !== 'client') return
  removeFeatureFiles({ stage, disabled: ['server'], group: 'serverOnly' })
  cpSync(new URL('files/', staticFiles), stage, { recursive: true })
  const edit = (file: string) => (pattern: RegExp, replacement: string) => {
    const content = readFileSync(path.join(stage, file), 'utf8')
    write({
      file,
      content: editTemplate({ file, text: content, pattern, replacement })
    })
  }
  if (profile.hasTheme !== false) {
    edit('docs/ui.md')(
      /^## Theme and persistence\n[\s\S]*?(?=^## )/mu,
      '## Theme and persistence\n\nThe initial script reads `app-theme` from local storage before hydration. The\nswitcher saves light, dark or system on this device. The static host serves the\nsame HTML for all three preferences.\n\n'
    )
    edit('AGENTS.md')(
      /Document owns the script element and its request nonce\./u,
      'Document owns the script element. Publish its hash in the CSP for each HTML file.'
    )
    cpSync(new URL('theme/', staticFiles), stage, { recursive: true })
    const themeTest =
      'src/components/molecules/ThemeToggle/__tests__/ThemeToggle.browser.test.tsx'
    edit(themeTest)(/^import \{ readTheme[^\n]+\n/mu, '')
    edit(themeTest)(
      /await expect\.poll\(\(\) => readTheme\(\)\)\.toBe\(value\)/u,
      "await expect.poll(() => localStorage.getItem('app-theme')).toBe(value)"
    )
    const helper = 'src/tests/helpers/clearThemeCookie/index.ts'
    rmSync(path.join(stage, helper))
    edit(
      'src/components/molecules/ThemeToggle/__tests__/ThemeToggle.browser.test.tsx'
    )(/^import \{ clearThemeCookie[^\n]+\n/mu, '')
    edit(
      'src/components/molecules/ThemeToggle/__tests__/ThemeToggle.browser.test.tsx'
    )(/clearThemeCookie/gu, "() => localStorage.removeItem('app-theme')")
  }
  edit('AGENTS.md')(
    /^## Server errors and backend calls\n[\s\S]*?(?=^## )/mu,
    ''
  )
  const vite = 'vite.config.ts'
  edit(vite)(/^import \{ SECURITY_HEADERS[^\n]+\n/mu, '')
  edit(vite)(
    /^ *serverSetup: [^\n]*\n *e2e: \{[\s\S]*?\n *\},\n/mu,
    "  output: 'static',\n"
  )
  edit(vite)(/^ *securityHeaders: SECURITY_HEADERS,\n/mu, '')
  edit(vite)(/,\n {2}\/\/ Without fallthrough,[\s\S]*?\n\}\)/u, '\n})')
  rewriteKnip(stage)
  staticCatalogs(stage, profile.hasTheme)
  pkg.scripts.start = 'node tooling/testing/serve-public.ts'
  pkg.scripts['test:e2e'] = 'vp run playwright test'
  delete pkg.scripts['test:e2e:production']
}
