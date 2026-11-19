import { uiProfiles } from './ui-profiles.ts'

type Selection = { locales?: string[]; baseLocale?: string; hasI18n?: boolean }
const modes = ['server', 'static', 'client'] as const
const publications = modes.flatMap(mode =>
  [true, false].map(hasSeo => ({ mode, hasSeo }))
)
export type MatrixCase = {
  mode: (typeof modes)[number]
  hasSeo: boolean
  hasDiagnostics: boolean
  hasTheme: boolean
  hasIcons: boolean
  hasFonts: boolean
  selection: Selection
}
export function* matrixCases(): Generator<MatrixCase> {
  for (const { mode, hasSeo } of publications) {
    for (const hasDiagnostics of [true, false]) {
      for (const { hasFonts, hasIcons, hasTheme } of uiProfiles()) {
        const selections: Selection[] = [{}]
        if (
          hasDiagnostics === hasFonts &&
          hasFonts === hasIcons &&
          hasIcons === hasTheme &&
          hasSeo === (mode === 'client' ? false : hasTheme)
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
          yield {
            mode,
            hasSeo,
            hasDiagnostics,
            hasFonts,
            hasIcons,
            hasTheme,
            selection
          }
        }
      }
    }
  }
}
