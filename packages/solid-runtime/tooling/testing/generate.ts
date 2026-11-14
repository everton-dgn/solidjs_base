import { compile } from '@inlang/paraglide-js'

import settings from './project.inlang/settings.json' with { type: 'json' }

await compile({
  project: './tooling/testing/project.inlang',
  outdir: './tooling/testing/generated',
  emitTsDeclarations: true,
  strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
  cookieName: 'locale',
  cookieSameSite: 'lax',
  cookieSecure: 'auto',
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
