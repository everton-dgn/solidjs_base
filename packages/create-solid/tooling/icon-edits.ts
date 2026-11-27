type Edit = readonly [RegExp, string]

const iconImports: Edit = [/^import \w+ from 'icon:[^']+'\n/gmu, '']
const home = 'src/routes/(base)/(home)'
const atoms = 'src/components/atoms'
const molecules = 'src/components/molecules'
const organisms = 'src/components/organisms'
const closeIcon = /<IconClose width=\{18\} height=\{18\} \/>/u
const iconSpan: Edit = [/^ *<span class=\{S\.icon\}>[\s\S]*?<\/span>\n/mu, '']

export const iconEdits: Record<string, readonly Edit[]> = {
  _gitignore: [[/^\/src\/icon-collections\.d\.ts\n/mu, '']],
  'vite.config.ts': [[/^ *icons: \{ 'my-images': .*\n/mu, '']],
  [`${home}/index.tsx`]: [
    iconImports,
    [/^ *<SolidLogo class=\{S\.logo\} \/>\n\n/mu, '']
  ],
  [`${home}/styles.module.css`]: [[/^[\s\S]*?(?=\.subtitle \{)/u, '']],
  [`${organisms}/Topbar/index.tsx`]: [
    iconImports,
    [/<IconGithub \/>/u, '{SITE_LINKS.repository.label}']
  ],
  [`${organisms}/Topbar/styles.module.css`]: [
    [/width: 36px;/u, 'padding-inline: 8px;']
  ],
  [`${organisms}/ErrorFallback/constants.ts`]: [
    iconImports,
    [/^import type \{ ComponentProps, JSX \}[^\n]*\n/mu, ''],
    [/^ *icon: \(props:[^\n]*\n/mu, ''],
    [/\},\n *icon: Icon\w+/gu, '}']
  ],
  [`${organisms}/ErrorFallback/index.tsx`]: [
    [/dynamicComponent, /u, ''],
    [/^ *const Icon = dynamicComponent[^\n]*\n/mu, ''],
    [/^ *<Icon \/>\n/mu, '']
  ],
  [`${organisms}/ErrorFallback/styles.module.css`]: [
    [/\n *& svg \{[^}]+\}\n/u, '\n']
  ],
  [`${organisms}/ErrorFallback/__tests__/ErrorFallback.dom.test.tsx`]: [
    [/\n {2}it\('replaces the icon [\s\S]*?\n {2}\}\)\n/u, '\n']
  ],
  [`${atoms}/ToastProvider/index.tsx`]: [
    iconImports,
    [/dynamicComponent, /u, ''],
    [/icon: Icon\w+, /gu, ''],
    [/^ *const Icon = dynamicComponent\([\s\S]*?\n *\)\n/mu, ''],
    iconSpan,
    [closeIcon, '{m.toast_close()}']
  ],
  [`${atoms}/ToastProvider/styles.module.css`]: [
    [/\.icon \{[^}]+\}\n\n/u, ''],
    [/& \.icon \{/gu, '& .label {'],
    [/width: 32px;/u, 'padding-inline: 8px;']
  ],
  [`${molecules}/OutdatedPageNotice/index.tsx`]: [
    iconImports,
    iconSpan,
    [/size="icon"/u, 'size="sm"'],
    [closeIcon, '{m.outdatedPageNotice_dismiss()}']
  ],
  [`${molecules}/OutdatedPageNotice/styles.module.css`]: [
    [/'icon content close'/u, "'content close'"],
    [/'\. actions actions'/u, "'actions actions'"],
    [/auto minmax/u, 'minmax'],
    [/\.icon \{[^}]+\}\n\n/u, '']
  ],
  [`${molecules}/ThemeToggle/index.tsx`]: [
    iconImports,
    [/dynamicComponent, Show, /u, ''],
    [/\{ label: (?<label>m\.\w+), icon: Icon\w+ \}/gu, '$<label>'],
    [/^ *const ThemeIcon = dynamicComponent[^\n]*\n/mu, ''],
    [
      /items=\{THEMES\.map\(theme => \{[\s\S]*?\}\)\}/u,
      'items={THEMES.map(theme => ({ value: theme, label: THEME_OPTIONS[theme]() }))}'
    ],
    [
      /THEME_OPTIONS\[state\.theme\(\)\]\.label\(\)/u,
      'THEME_OPTIONS[state.theme()]()'
    ],
    [/size="icon"/u, 'size="sm"'],
    [/<Show\b[\s\S]*?<\/Show>/u, '{THEME_OPTIONS[state.theme()]()}']
  ],
  'AGENTS.md': [
    [
      /stays excluded from the lint\. `src\/icon-collections[\s\S]*?and is not committed\./u,
      'stays excluded from the lint.'
    ]
  ],
  'docs/development.md': [
    [
      /`lint-project` and `check-project`\ndeclare `dependsOn:[\s\S]*?same inputs\./u,
      'Both tasks run the CSS lint first and share the same inputs.'
    ]
  ],
  'docs/architecture.md': [
    [
      /generated declarations `src\/@types\/routes.d.ts` and `src\/icon-collections.d.ts`\nstay/u,
      'generated declaration `src/@types/routes.d.ts` stays'
    ]
  ],
  'docs/ui.md': [[/\n## Local SVGs as components[\s\S]*$/u, '\n']]
}

export const iconReadmeEdits: readonly Edit[] = [
  [
    /^`defineSolidApp` loads the icons plugin,[\s\S]*?collection it imports\.\n/mu,
    ''
  ],
  [/Env, icons, fonts/u, 'Env and fonts'],
  [
    /icons from `hugeicons` and the app's own SVG folder as Solid components, and /u,
    ''
  ],
  [/CSS rules, icons and fonts/u, 'CSS rules and fonts']
]
