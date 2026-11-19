import type { FileEdits, TextEdit } from './profile-edits.ts'

const pages = 'src/tests/pages'
const site = 'src/constants/site/i18n'
const routes = 'src/routes/(base)'
const pt: TextEdit = [/Selecionar tema/gu, 'Selecionar idioma']
const es: TextEdit = [/Seleccionar tema/gu, 'Seleccionar idioma']
const en: TextEdit = [/Select theme/gu, 'Select language']
const englishSite: TextEdit = [/ and light and dark themes/gu, '']
const portugueseSite: TextEdit = [/ e temas claro e escuro/gu, '']
const languageMenu: TextEdit = [/The theme menu/u, 'The language menu']
const hydrationCheck: TextEdit = [
  /await expect\(\s*page\.getByRole\('button', \{ name: '[^']+' \}\)\s*\)\.toBeEnabled\(\)/gu,
  "await expect(page.locator('html')).toHaveAttribute('data-hydration-ended', '')"
]
const unhydrated: TextEdit = [
  /await expect\(\s*page\.getByRole\('button', \{ name: [^}]+ \}\)\s*\)\.toBeDisabled\(\)/gu,
  "await expect(page.locator('html')).not.toHaveAttribute('data-hydration-ended')"
]
function homeDescription(sentence: string): TextEdit {
  return [/(?<end>\{language\}\.)(?: [^"\n]+)"/u, `$<end> ${sentence}"`]
}
export const themeEdits: FileEdits = {
  [`${pages}/UiKit/UiKit.e2e.test.ts`]: [
    [/narrow dark viewport/gu, 'narrow viewport'],
    [/toHaveClass\('dark'\)/u, "not.toHaveClass('dark')"]
  ],
  [`${pages}/Home/Home.production.e2e.test.ts`]: [
    [/const MENU_TRIGGERS = 2/u, 'const MENU_TRIGGERS = 1']
  ],
  'src/Document.tsx': [
    [/import \{\n *DEFAULT_THEME,[\s\S]*?'@\/constants\/theme\.ts'\n/u, ''],
    [/^ *const cookieHeader =[\s\S]*?(?=^ *\/\/ The browser)/mu, ''],
    [/^ *const (?:theme|explicitTheme) =[^\n]*\n/gmu, ''],
    [/ class=\{explicitTheme\}/u, ''],
    [/^ *<meta name="theme-color"[^\n]+\n/mu, ''],
    [/^ *<script nonce=\{nonce\}>\{themeScript[^\n]+\n/mu, '']
  ],
  'src/components/organisms/Topbar/index.tsx': [
    [/^import \{ ThemeToggle \}[^\n]+\n/mu, ''],
    [/^ *<ThemeToggle \/>\n/mu, '']
  ],
  'src/components/molecules/Provider/index.tsx': [
    [/import \{ createTheme \}[\s\S]*?(?=export function)/u, '\n'],
    [
      /return \(\s*<ThemeContext[\s\S]*?<\/ThemeContext>\s*\)/u,
      'return <ToastProvider>{props.children}</ToastProvider>'
    ]
  ],
  'src/theme/tokens/shadows.css': [
    [
      /light-dark\(\s*(?<light>color-mix\([^\n]+?transparent\)),\s*(?:transparent|color-mix\([^\n]+?transparent\))\s*\)/gu,
      '$<light>'
    ]
  ],
  'src/theme/tokens/colors.css': [
    [/color-scheme: light dark/u, 'color-scheme: light'],
    [
      /light-dark\(\s*(?<light>oklch\([^)]*\)|var\([^)]*\)|color-mix\([^)]*\)[^)]*\))\s*,\s*(?:oklch\([^)]*\)|var\([^)]*\)|color-mix\([^)]*\)[^)]*\))\s*\)/gu,
      '$<light>'
    ],
    [/\n *&\.light \{[\s\S]*?&\.dark \{[^}]+\}/u, '']
  ],
  [`${site}/en.json`]: [englishSite],
  [`${site}/pt.json`]: [portugueseSite],
  [`${site}/es.json`]: [[/ y temas claro y oscuro/u, '']],
  [`${routes}/(home)/i18n/en.json`]: [
    homeDescription(
      'Use the language menu to read this page in another language. Each translation has its own address, so you can bookmark a page or share a direct link to the version you are reading.'
    )
  ],
  [`${routes}/(home)/i18n/es.json`]: [
    homeDescription(
      'Usa el menú de idiomas para leer esta página en otro idioma. Cada traducción tiene su propia dirección, así que puedes guardar la página o compartir un enlace directo a la versión que estás leyendo.'
    )
  ],
  [`${routes}/(home)/i18n/pt.json`]: [
    homeDescription(
      'Use o menu de idiomas para ler esta página em outro idioma. Cada tradução tem seu próprio endereço, que você pode salvar nos favoritos ou compartilhar para que outra pessoa leia a mesma versão.'
    )
  ],
  [`${routes}/about/i18n/en.json`]: [[/, themes and/u, ' and']],
  [`${routes}/about/i18n/es.json`]: [[/, temas y/u, ' y']],
  [`${routes}/about/i18n/pt.json`]: [[/, temas e/u, ' e']],
  [`${routes}/privacy/i18n/en.json`]: [
    [/language and theme preferences/u, 'language preferences'],
    [/the language and theme preference/u, 'the language preference']
  ],
  [`${routes}/privacy/i18n/es.json`]: [
    [/idioma y tema/u, 'idioma'],
    [/el idioma y la preferencia de tema/u, 'el idioma']
  ],
  [`${routes}/privacy/i18n/pt.json`]: [
    [/idioma e tema/u, 'idioma'],
    [/o idioma e a preferência de tema/u, 'o idioma']
  ],
  [`${pages}/SeoIndexes/SeoIndexes.e2e.test.ts`]: [englishSite],
  [`${pages}/Home/Home.seo.e2e.test.ts`]: [portugueseSite],
  [`${pages}/I18n/I18n.hydration.e2e.test.ts`]: [
    pt,
    es,
    [/theme:/gu, 'selector:'],
    [/language\.theme/gu, 'language.selector']
  ],
  [`${pages}/I18n/I18n.production.e2e.test.ts`]: [es],
  [`${pages}/I18n/I18n.redirect.e2e.test.ts`]: [hydrationCheck],
  [`${pages}/I18n/I18n.e2e.test.ts`]: [hydrationCheck],
  [`${pages}/StructuredData/StructuredData.security.e2e.test.ts`]: [
    hydrationCheck
  ],
  [`${pages}/StructuredData/StructuredData.streaming.e2e.test.ts`]: [
    unhydrated
  ],
  [`${pages}/NotFound/NotFound.seo.e2e.test.ts`]: [en, languageMenu],
  [`${pages}/Hydration/Hydration.parser.e2e.test.ts`]: [en],
  [`${pages}/Hydration/Hydration.streaming.e2e.test.ts`]: [en],
  [`${pages}/Hydration/Hydration.preload.e2e.test.ts`]: [unhydrated, en],
  [`${pages}/Hydration/Hydration.e2e.test.ts`]: [
    [
      /await expect\(trigger\)\.toBeDisabled\(\)/u,
      "await trigger.click()\n    await expect(page.getByRole('menu')).toHaveCount(0)"
    ],
    [
      /await expect\(page.getByRole\('button', \{ name: THEME_BUTTON \}\)\)\.toBeDisabled\(\)/u,
      "await page.getByRole('button', { name: LANGUAGE_BUTTON }).click()\n  await expect(page.getByRole('menu')).toHaveCount(0)"
    ],
    en,
    [/THEME_BUTTON/gu, 'LANGUAGE_BUTTON']
  ],
  [`${pages}/Home/Home.layout.e2e.test.ts`]: [
    pt,
    [
      /in the (?<scheme>\$\{colorScheme\}) theme/u,
      'with a $<scheme> system preference'
    ],
    [/toHaveClass\(colorScheme\)/u, "toHaveCSS('color-scheme', 'light')"]
  ],
  [`${pages}/Home/Home.csp.production.e2e.test.ts`]: [
    pt,
    languageMenu,
    [/Inline theme script, HydrationScript/u, 'HydrationScript'],
    [/DOCUMENT_SCRIPTS = 3/u, 'DOCUMENT_SCRIPTS = 2'],
    [/^const HTML_TAG[^\n]+\nconst THEME_KEY[^\n]+\n/mu, ''],
    [/\n {2}\/\/ Without 'unsafe-inline'[\s\S]*$/u, '\n})\n']
  ],
  [`${pages}/AgentReadiness/AgentReadiness.content.production.e2e.test.ts`]: [
    [/^ *(?:theme|dark): '[^']+',\n/gmu, ''],
    [/keeps theme and locale/u, 'keeps the locale'],
    [
      /^ *await page.getByRole\('button', \{ name: language.theme \}\).click\(\)\n *await page\n *\.getByRole\('menuitemradio',[\s\S]*?\.click\(\)\n/mu,
      ''
    ],
    [
      /^ *await expect\(page.locator\('html'\)\).toHaveClass\('dark'\)\n/gmu,
      ''
    ],
    [
      /^ *await expect\(\n *page.getByRole\('button', \{ name: language.theme \}\)\n *\).toBeInViewport\(\)\n/mu,
      ''
    ],
    [
      /theme and locale stay\n *\/\/ outside it/u,
      'the locale control stays outside it'
    ],
    [
      /^ *await page.getByRole\('button', \{ name: language.theme \}\).click\(\)\n *await expect\([\s\S]*?toHaveAttribute\('aria-checked', 'true'\)\n/mu,
      ''
    ]
  ]
}

export const themeReadmeEdits: readonly TextEdit[] = [
  [
    /The home page, captured from the production build at 750 px wide:\n\n/u,
    ''
  ],
  [/<picture>[\s\S]*?<\/picture>\n\n/gu, ''],
  englishSite,
  [/, and the theme button for light, dark\nor system/u, ''],
  [/language and theme switchers/u, 'a language switcher'],
  [/^\| Theme +\|[^\n]+\n/mu, ''],
  [
    /server errors, the theme, locale navigation/u,
    'server errors, locale navigation'
  ],
  [/Components, theme and styles/u, 'Components and styles'],
  [/the theme, tokens/u, 'tokens']
]
