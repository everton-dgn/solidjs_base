import { compile } from '@inlang/paraglide-js'

import settings from '../../project.inlang/settings.json'

await compile({
  project: './project.inlang',
  outdir: './paraglide',
  emitTsDeclarations: true,
  urlPatterns: [
    {
      pattern: '/',
      localized: settings.locales.map(locale => [locale, `/${locale}`])
    },
    {
      pattern: '/:path(.*)?',
      localized: settings.locales.map(locale => [
        locale,
        `/${locale}/:path(.*)?`
      ])
    }
  ]
})
