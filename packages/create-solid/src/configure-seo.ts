import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { removeFeatureFiles } from './configure-fonts.ts'
import type { GenerationContext } from './generate.ts'
import { removeSeoCopy } from './seo-copy.ts'
import { removeSeoTests } from './seo-tests.ts'

export function configureSeo(stage: string, context: GenerationContext): void {
  if (context.profile.seo !== false) return
  const { pkg, write } = context
  for (const feature of ['seo', 'markdown', 'publication', 'sitemap']) {
    removeFeatureFiles(stage, feature)
  }
  delete pkg.devDependencies['schema-dts']
  delete pkg.patchedDependencies
  delete pkg.scripts['test:tooling']
  pkg.scripts.validate =
    pkg.scripts.validate?.replace(' && vp run test:tooling', '') ?? ''
  function edit(file: string, replacement: (text: string) => string): void {
    const target = path.join(stage, file)
    if (existsSync(target)) {
      write(file, replacement(readFileSync(target, 'utf8')))
    }
  }
  edit('pnpm-workspace.yaml', text =>
    text.replace(/^patchedDependencies:\n(?: {2}[^\n]*\n)+/mu, '')
  )
  edit('vite.config.ts', text =>
    text
      .replace(/^import \{ ROBOTS[^\n]*\n/mu, '')
      .replace(/\n{3}(?=export default)/u, '\n\n')
      .replace(/^ {2}seo: \{[\s\S]*?^ {2}\},?\n/mu, '')
      .replace(/,\n\}\)/u, '\n})')
  )
  edit('src/App.tsx', text =>
    text
      .replace(/^import \{ createSeo[^\n]*\n/mu, '')
      .replace(/^ *createSeo\(\{ route: true \}\)\n/mu, '')
  )
  edit('src/Document.tsx', text =>
    text.replace(/^ *<meta name="author"[^\n]+\n/mu, '')
  )
  edit('src/middleware/index.ts', text =>
    text
      .replace(/^import \{ markdownContent[^\n]*\n/mu, '')
      .replace(/extra,\n *document: markdownContent/u, 'extra')
  )
  edit('src/components/organisms/ErrorFallback/index.tsx', text =>
    text
      .replace('httpStatus, useHead', 'httpStatus')
      .replace(/^ {2}useHead\([\s\S]*?^ {2}\)\n\n/mu, '')
  )
  edit('src/@types/routes.d.ts', text =>
    text.replace(/,\n {4}\{\n {6}path: "\/\(seo\)[\s\S]*?(?=\n {2}\];)/u, '')
  )
  edit('tooling/knip.ts', text =>
    text.replaceAll(
      /^ *\/\/ [^\n]*(?:robots virtual module|Public configuration and metrics API)[^\n]*\n[^\n]*\n/gmu,
      ''
    )
  )
  edit('tooling/testing/serve-public.ts', text =>
    text.replace(/^ *'.md': 'text\/markdown',\n/mu, '')
  )
  edit('vercel.json', text =>
    text.replace(/,\n {2}"headers":[\s\S]*?\n\}/u, '\n}')
  )
  removeSeoTests(stage, edit)
  removeSeoCopy(stage)
  edit('src/Document.tsx', text =>
    text.replace(/^ *<link rel="describedby"[^\n]+\n/mu, '')
  )
  for (const page of ['(home)', 'about', 'contact', 'privacy', '[...404]']) {
    edit(`src/routes/(base)/${page}/index.tsx`, text =>
      text
        .replace(/^import \{ seo \} from '\.\/seo.ts'\n\n/mu, '')
        .replace(
          /export const route = \{\n {2}info: \{[\s\S]*?\n\} satisfies RouteDefinition\n\n/u,
          'export const route = {}\n\n'
        )
        .replace(/,\n {2}info: \{ seo \}/u, '')
        .replace(/^import type \{ RouteDefinition \}[^\n]*\n/mu, line =>
          page === '[...404]' ? line : ''
        )
    )
  }
  write(
    'src/constants/site/index.ts',
    `import { localeTag } from '@evertondgn/solid-runtime/i18n/locale-tag'
import { getLocale } from '@paraglide/runtime.js'

import { LOCALE_TAG_OVERRIDES } from '@/i18n/localeTagOverrides/index.ts'

export const SITE = {
  title: 'SolidJS Boilerplate',
  author: { url: 'https://github.com/everton-dgn' },
  repositoryUrl: 'https://github.com/everton-dgn/boilerplate_solidjs',
  get locale(): string {
    return localeTag(getLocale(), LOCALE_TAG_OVERRIDES)
  }
}
`
  )
}
