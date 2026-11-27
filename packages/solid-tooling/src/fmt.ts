import type { UserConfig } from 'vite-plus'

import { ICON_TYPES_FILE } from './icons/constants.ts'

export const fmt: NonNullable<UserConfig['fmt']> = {
  printWidth: 80,
  singleQuote: true,
  semi: false,
  trailingComma: 'none',
  arrowParens: 'avoid',
  proseWrap: 'always',
  sortPackageJson: false,
  embeddedLanguageFormatting: 'off',
  sortImports: {
    groups: [
      'builtin',
      'external',
      ['internal', 'subpath'],
      ['parent', 'sibling', 'index'],
      'style',
      'unknown'
    ]
  },
  ignorePatterns: [
    'public/**',
    'src/assets/**',
    'src/@types/routes.d.ts',
    ICON_TYPES_FILE,
    '**/*.svg',
    '*.lock',
    // pnpm rewrites this file during installation.
    'pnpm-workspace.yaml',
    'AGENTS.md',
    '.agents/**',
    '.claude/**'
  ]
}
