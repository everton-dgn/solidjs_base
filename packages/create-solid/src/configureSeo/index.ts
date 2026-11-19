import { readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import {
  featureFiles,
  removeFeatureFiles
} from '../removeFeatureFiles/index.ts'
import { removeSeoCopy } from '../removeSeoCopy/index.ts'
import { removeSeoTests } from '../removeSeoTests/index.ts'
import type { EditFile, StagedContext } from '../types.ts'

export function configureSeo(context: StagedContext): void {
  const { stage } = context
  if (context.profile.hasSeo !== false) return
  const { pkg, write } = context
  const isServer = (context.profile.mode ?? 'server') === 'server'
  removeFeatureFiles({
    stage,
    disabled: ['seo', 'markdown', 'publication', 'sitemap']
  })
  delete pkg.devDependencies['schema-dts']
  delete pkg.patchedDependencies
  const omitted = isServer
    ? new Set<string>()
    : featureFiles({ disabled: ['server'], group: 'serverOnly' })
  if (context.profile.pm !== 'pnpm') omitted.add('pnpm-workspace.yaml')
  const edit: EditFile = (file, transform) => {
    const target = path.join(stage, file)
    if (!omitted.has(file)) {
      write({
        file,
        content: transform(readFileSync(target, 'utf8'), (input, edits) => {
          let text = input
          for (const [pattern, replacement, shouldApply] of edits) {
            if (shouldApply !== false) {
              text = editTemplate({ file, text, pattern, replacement })
            }
          }
          return text
        })
      })
    }
  }
  edit('pnpm-workspace.yaml', (text, apply) =>
    apply(text, [[/^patchedDependencies:\n(?: {2}[^\n]*\n)+/mu, '']])
  )
  edit('vite.config.ts', (text, apply) =>
    apply(text, [
      [
        /^ {2}\/\/ Without fallthrough,[\s\S]*?(?=^ {2}staticPaths:)/mu,
        '',
        isServer
      ],
      [/^import \{ ROBOTS[^\n]*\n/mu, ''],
      [/\n+(?=export default)/u, '\n\n'],
      [/^ {2}seo: \{[\s\S]*?^ {2}\},?\n/mu, ''],
      [/,?\n\}\)/u, '\n})']
    ])
  )
  edit('src/App.tsx', (text, apply) =>
    apply(text, [
      [/^import \{ createSeo[^\n]*\n/mu, ''],
      [/^ *createSeo\(\{ route: true \}\)\n/mu, '']
    ])
  )
  edit('src/Document.tsx', (text, apply) =>
    apply(text, [[/^ *<meta name="author"[^\n]+\n/mu, '']])
  )
  edit('src/middleware/index.ts', (text, apply) =>
    apply(text, [
      [/^import \{ markdownContent[^\n]*\n/mu, ''],
      [/extra,\n *document: markdownContent/u, 'extra']
    ])
  )
  edit('src/components/organisms/ErrorFallback/index.tsx', (text, apply) =>
    apply(text, [
      [
        /^ {2}useHead\([\s\S]*?^ {2}\)\n\n/mu,
        "  useHead(() =>\n    props.kind === 'runtime'\n      ? [{ tag: 'title', props: { children: content().title } }]\n      : []\n  )\n\n"
      ]
    ])
  )
  edit('src/@types/routes.d.ts', (text, apply) =>
    apply(text, [[/,\n {4}\{\n {6}path: "\/\(seo\)[\s\S]*?(?=\n {2}\];)/u, '']])
  )
  edit('tooling/knip.ts', (text, apply) =>
    apply(text, [
      [
        /^ *\/\/ [^\n]*(?:robots virtual module|Public configuration and metrics API)[^\n]*\n[^\n]*\n/gmu,
        ''
      ],
      ["'server-only', ", '', context.profile.mode === 'static']
    ])
  )
  edit('vercel.json', (text, apply) =>
    apply(text, [[/,\n {2}"headers":[\s\S]*?\n\}/u, '\n}']])
  )
  removeSeoTests({ edit, isServer })
  removeSeoCopy(stage)
  edit('src/Document.tsx', (text, apply) =>
    apply(text, [[/^ *<link rel="describedby"[^\n]+\n/mu, '']])
  )
  for (const [page, title] of Object.entries({
    '(home)': 'home_seoTitle',
    about: 'about_title',
    contact: 'contact_title',
    privacy: 'privacy_title',
    '[...404]': 'notFound_title'
  })) {
    edit(`src/routes/(base)/${page}/index.tsx`, (text, apply) =>
      apply(text, [
        [
          page === '[...404]'
            ? 'import type { RouteDefinition }'
            : "import { m } from '@paraglide/messages.js'",
          page === '[...404]'
            ? "import { m } from '@paraglide/messages.js'\nimport type { RouteDefinition }"
            : "import { m } from '@paraglide/messages.js'\nimport { useHead } from '@solidjs/web'"
        ],
        [
          'import { httpStatus }',
          'import { httpStatus, useHead }',
          page === '[...404]'
        ],
        [
          /export default function \w+\(\) \{\n/u,
          `$&  useHead(() => [{ tag: 'title', props: { children: m.${title}() } }])\n`
        ],
        [/^import \{ seo \} from '\.\/seo.ts'\n\n/mu, ''],
        [
          /export const route = \{\n {2}info: \{[\s\S]*?\n\} satisfies RouteDefinition\n\n/u,
          'export const route = {}\n\n',
          page !== '[...404]'
        ],
        [/,\n {2}info: \{ seo \}/u, '', page === '[...404]'],
        [
          /^import type \{ RouteDefinition \}[^\n]*\n/mu,
          '',
          page !== '[...404]'
        ]
      ])
    )
  }
  write({
    file: 'src/constants/site/index.ts',
    content: `import { localeTag } from '@evertondgn/solid-runtime/i18n/locale-tag'
import { getLocale } from '@paraglide/runtime.js'

import { LOCALE_TAG_OVERRIDES } from '@/i18n/localeTagOverrides/index.ts'

import { SITE as identity } from './title.ts'

export const SITE = {
  title: identity.title,
  author: { url: 'https://github.com/everton-dgn' },
  repositoryUrl: 'https://github.com/everton-dgn/boilerplate_solidjs',
  get locale(): string {
    return localeTag(getLocale(), LOCALE_TAG_OVERRIDES)
  }
}
`
  })
}
