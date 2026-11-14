import type { UserConfig } from 'vite-plus'

type LintConfig = NonNullable<UserConfig['lint']>
type GlobalRestrictions = { names: string[]; properties?: string[] }

const NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']
const RESTRICTED_GLOBALS = [...NETWORK, 'console']
const GLOBALS = ['globalThis', 'window', 'self', 'global']
function globals({
  names,
  properties = names
}: GlobalRestrictions): LintConfig['rules'] {
  return {
    'eslint/no-restricted-globals': [
      'error',
      {
        globals: names,
        checkGlobalObject: true,
        globalObjects: ['global']
      }
    ],
    'eslint/no-restricted-properties': [
      'error',
      ...GLOBALS.flatMap(object =>
        properties.map(property => ({
          object,
          property,
          message:
            property === 'console'
              ? 'Log failures only through logServerFailure.'
              : 'Call the backend through requestJson, or through an adapter in src/infra/server/ wrapped in protectServerOperation.'
        }))
      )
    ]
  }
}

const backendPolicy: NonNullable<LintConfig['overrides']> = [
  {
    files: ['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    rules: {
      'backend/static-solid-imports': 'error',
      'backend/static-render-integrity-imports': 'error',
      'eslint/no-console': ['error', { allow: [] }],
      ...globals({ names: RESTRICTED_GLOBALS }),
      // The backend rule applies the shared relative limit after normalization.
      'eslint/no-restricted-imports': 'off',
      'backend/restricted-imports': 'error'
    }
  },
  {
    files: ['src/infra/server/requestJson/index.ts'],
    rules: globals({
      names: RESTRICTED_GLOBALS.filter(name => name !== 'fetch')
    })
  },
  {
    files: ['src/infra/server/configureServerErrors/index.ts'],
    rules: {
      'backend/restricted-imports': [
        'error',
        { allowServerConfiguration: true }
      ],
      'backend/no-setup-exports': 'error'
    }
  },
  {
    files: [
      'src/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'src/**/*.test-d.{ts,tsx}',
      'src/**/*.d.{ts,mts,cts}'
    ],
    rules: {
      'backend/static-solid-imports': 'off',
      'backend/static-render-integrity-imports': 'off',
      'eslint/no-console': 'off',
      'eslint/no-restricted-globals': 'off',
      'eslint/no-restricted-properties': 'off',
      'backend/restricted-imports': ['error', { testFile: true }]
    }
  }
]

export default backendPolicy
