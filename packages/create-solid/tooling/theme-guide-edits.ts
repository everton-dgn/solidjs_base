import type { FileEdits } from './profile-edits.ts'

export const themeGuideEdits: FileEdits = {
  'AGENTS.md': [
    [/\n## Runtime theme\n[\s\S]*?(?=\n## )/u, ''],
    [/`makeSystemTheme\/index.ts`/u, '`makeFocusOriginHandler/index.ts`'],
    [
      /such as `themeStorage` for `readTheme`\n +and `saveTheme`/u,
      'such as `preferences` for `readPreference` and `savePreference`'
    ],
    [/\bTheme\b/gu, 'Preference'],
    [/saveTheme/gu, 'savePreference'],
    [/theme: 'dark'/u, "locale: 'en'"],
    [/\[theme, setPreference\]/u, '[locale, setPreference]'],
    [/\[systemTheme, setSystem\]/u, '[currentLocale, setLocale]'],
    [/ In `createTheme`[\s\S]*?`theme: themePreference`\./u, '']
  ],
  'docs/architecture.md': [
    [
      /such as `makeThemeChannel`, which returns its disposal, and the/u,
      'and the'
    ],
    [/such as\n`createTheme`/u, 'such as `createToastState`'],
    [/`ThemeToggle`\n +and `LocaleSwitcher` build/u, '`LocaleSwitcher` builds']
  ],
  'docs/i18n.md': [[/themeToggle_select/u, 'localeSwitcher_select']],
  'docs/security.md': [
    [/ That is why `Document` applies the theme[\s\S]*?does not block\./u, ''],
    [
      /in the inline theme script and in the script of the\n +client entry/u,
      'in the script of the client entry'
    ]
  ],
  'docs/testing.md': [
    [
      /such as\n`isTheme`[\s\S]*?; subjects with a dot/u,
      'such as `Input` in `src/components/atoms/Input/__tests__/Input.dom.test.tsx`; subjects with a dot'
    ],
    [/Home\.themeCss\.e2e/u, 'Home.layout.e2e'],
    [
      /the hydration of\nthe theme switcher,[\s\S]*?layout and the 404 response/u,
      'keyboard navigation, layout and the 404 response'
    ],
    [/keeps the theme, the locale/u, 'keeps the locale'],
    [
      /the theme\nand locale buttons, outside it, stay/u,
      'the language button, outside it, stays'
    ],
    [
      /, also with the `dark` or `light` theme in the cookie, without a\n`style` attribute on `<html>`/u,
      ''
    ]
  ],
  'docs/ui.md': [
    [/, `light-dark\(\)` and/gu, ' and'],
    [/Components, theme and styles/u, 'Components and styles'],
    [
      /The theme and locale triggers[\s\S]*?(?=## Fonts)/u,
      'The language button includes the current language code in its accessible name.\n\n'
    ],
    [/`light-dark\(\)` becomes[\s\S]*?those rules\. /u, '']
  ]
}

export const themeIconGuideEdit = [
  /The theme switcher uses, for example,[\s\S]*?sun-01'`\./u,
  'The repository link uses `icon:hugeicons/github`.'
] as const
