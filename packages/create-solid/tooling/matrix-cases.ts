import { uiProfiles } from './ui-profiles.ts'

type Selection = { locales?: string[]; baseLocale?: string; hasI18n?: boolean }
const modes = ['server', 'static', 'client'] as const
const publications = modes.flatMap(mode =>
  [true, false].map(hasSeo => ({ mode, hasSeo }))
)
export function* matrixCases() {
  for (const { mode, hasSeo } of publications) {
    for (const diagnostics of [true, false]) {
      for (const {
        hasFonts: fonts,
        hasIcons: icons,
        hasTheme: theme
      } of uiProfiles()) {
        const selections: Selection[] = [{}]
        if (
          diagnostics === fonts &&
          fonts === icons &&
          icons === theme &&
          hasSeo === (mode === 'client' ? false : theme)
        ) {
          selections.push(
            { hasI18n: false },
            { locales: ['es'] },
            { locales: ['zh-Hant-TW'] },
            ...(mode === 'client'
              ? []
              : [
                  { locales: ['es', 'pt'], baseLocale: 'pt' },
                  { locales: ['fr', 'ja'], baseLocale: 'ja' },
                  {
                    locales: [
                      'pt-BR',
                      'es-MX',
                      'en-US',
                      'fr-CA',
                      'de-AT',
                      'zh-Hant-TW',
                      'ja-JP',
                      'it-CH'
                    ]
                  }
                ])
          )
        }
        for (const selection of selections) {
          yield { mode, hasSeo, diagnostics, fonts, icons, theme, selection }
        }
      }
    }
  }
}
