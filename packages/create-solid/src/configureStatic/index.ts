import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { parse, record, string } from 'valibot'

import {
  catalogLanguage,
  readLocaleSettings
} from '../configureLocales/catalogs.ts'
import { editCatalog, editTemplate } from '../edit-template.ts'
import { distribution } from '../paths.ts'
import { removeFeatureFiles } from '../removeFeatureFiles/index.ts'
import { rewriteKnip } from '../rewrite.ts'
import type { StagedContext } from '../types.ts'

const indent = 2
const catalogSchema = record(string(), string())
const staticFiles = new URL('static/', distribution)

function staticCatalogs(stage: string): void {
  const description = {
    en: 'A foundation for prerendered web applications with SolidJS, TypeScript and Vite+.',
    es: 'Una base para aplicaciones web prerenderizadas con SolidJS, TypeScript y Vite+.',
    pt: 'Uma base para aplicações web pré-renderizadas com SolidJS, TypeScript e Vite+.'
  }
  for (const locale of readLocaleSettings(stage).locales) {
    const language = catalogLanguage(locale)
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
      value: description[language]
    })
    writeFileSync(siteFile, `${JSON.stringify(site, null, indent)}\n`)
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
  staticCatalogs(stage)
  pkg.scripts.start = 'node tooling/testing/serve-public.ts'
  pkg.scripts['test:e2e'] = 'vp run playwright test'
  delete pkg.scripts['test:e2e:production']
}
