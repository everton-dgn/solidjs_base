import type { FileEdits } from './profile-edits.ts'

export const staticEdits: FileEdits = {
  'src/middleware/markdownContent/__tests__/markdownContent.protocol.node.test.ts':
    [[/\/es`/u, '/en`']],
  'src/tests/setup/browser/__tests__/browser.browser.test.ts': [
    [/baseLocale, getLocale, setLocale/u, 'baseLocale, getLocale'],
    [
      /beforeAll\(\(\) => setLocale\('pt', \{ reload: false \}\)\)/u,
      "const original = location.href\n  afterEach(() => history.replaceState(null, '', original))"
    ],
    [/ {2}afterAll\([^\n]+\n\n/u, ''],
    [
      /void setLocale\('es', \{ reload: false \}\)/u,
      "history.replaceState(null, '', '/es')"
    ],
    [
      /starts in the base locale even with an earlier preference/u,
      'reads the locale from the current URL'
    ],
    [
      /drops the preference written by the earlier test/u,
      'restores the original URL after the earlier test'
    ]
  ],
  'src/constants/http.ts': [[/^export const HTTP_CONFLICT = 409\n/mu, '']],
  'src/App.tsx': [
    [/getRequestEvent, isServer/u, 'isServer'],
    [/type ParentProps/u, ''],
    [/\/\/ The gate must throw[\s\S]*?(?=\/\/ A beforeunload)/u, ''],
    [
      /\/\/ A beforeunload of the page[\s\S]*?the blank screen\./u,
      '// If a reload stalls, show the error page after the deadline.'
    ],
    [
      /\/\/ A chunk or a server function[\s\S]*?the reload that did not solve it\./u,
      '// A stale chunk can recover by loading the current document.'
    ],
    [/^ *<\/?ServerFailureGate>\n/gmu, '']
  ],
  'src/entry-client/installOutdatedPageDetection/index.ts': [
    [
      /^import \{\n *configureServerFunctionsClient,[\s\S]*?'@solidjs\/web\/server-functions\/client'\n/u,
      ''
    ],
    [/, getObserver/u, ''],
    [/^import \{ HTTP_CONFLICT[^\n]+\n/mu, ''],
    [
      /OUTDATED_FALLBACK_EVENT,\n *REFUSED_SUBMIT_EVENT/u,
      'OUTDATED_FALLBACK_EVENT'
    ],
    [/^ *markPageOutdated,\n/mu, ''],
    [/function isDeclaredRead[\s\S]*?(?=\/\/ No preventDefault)/u, ''],
    [
      /^ *\/\/ The runtime keeps a single responseHandler[\s\S]*?(?=^ *return \(\) =>)/mu,
      ''
    ],
    [/^ *configureServerFunctionsClient\(\{[\s\S]*?\n {4}\}\)\n/mu, '']
  ],
  'src/infra/server/sitemap/index.ts': [
    [/^import \{ sitemapSources[^\n]*\n/mu, ''],
    [/sources: sitemapSources/u, 'sources: []']
  ],
  'src/routes/(seo)/llms.txt/constants.ts': [
    [
      /Pages are rendered on the server/u,
      'Pages are prerendered during the build'
    ],
    [
      /Markdown is derived[^\n]*browser version\./u,
      'Use the .md file for Markdown and the directory URL for HTML.'
    ],
    [
      / There is no public action API\. Do not call internal server-function endpoints\./u,
      ''
    ],
    [/server-rendered pages/u, 'prerendered pages'],
    [
      / Links to pages converted on request are listed there as not included\./u,
      ''
    ]
  ],
  'tooling/knip.ts': [
    [/^ *\/\/ serverSetup[\s\S]*?(?=^ *\/\/ Public configuration)/mu, ''],
    [/^ *\/\/ Middleware chain of the E2E build[^\n]*\n[^\n]*\n/mu, '']
  ]
}

export const staticThemeDocument = [
  [/readTheme,\n/u, ''],
  [/themeScript\n/u, 'initialThemeScript\n'],
  [/^ *const cookieHeader =[\s\S]*?(?=^ *\/\/ The browser)/mu, ''],
  [/^ *const theme = readTheme[^\n]*\n *const explicitTheme[^\n]*\n/mu, ''],
  [/ class=\{explicitTheme\}/u, ''],
  [/themeColor\(theme\)/u, 'themeColor(DEFAULT_THEME)'],
  [/themeScript\(theme\)/u, 'initialThemeScript']
] as const
