// Reviewed counts for global edits with more than one match. All other global edits require one match.
export const globalEditCounts: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = {
  'AGENTS.md': {
    '/\\bTheme\\b/gu': 2
  },
  'README.md': {
    '/<picture>[\\s\\S]*?<\\/picture>\\n\\n/gu': 5,
    '/https:\\/\\/boilerplate-solidjs.devinsights.dev/gu': 2
  },
  'README.md (publication guides)': {
    '/^\\| \\[(?:SEO and site indexes|Sitemap and content sources|Markdown and reading by agents|Editorial indexes, endpoints and cache|Publication artifacts and capacity)\\][^\\n]*\\n/gmu': 5
  },
  'docs/ui.md': {
    '/, `light-dark\\(\\)` and/gu': 2
  },
  'src/App.tsx': {
    '/^ *<\\/?ServerFailureGate>\\n/gmu': 2
  },
  'src/Document.tsx': {
    '/^ *const (?:theme|explicitTheme) =[^\\n]*\\n/gmu': 2
  },
  'src/components/atoms/ToastProvider/index.tsx': {
    "/^import \\w+ from 'icon:[^']+'\\n/gmu": 6,
    '/icon: Icon\\w+, /gu': 5
  },
  'src/components/atoms/ToastProvider/styles.module.css': {
    '/& \\.icon \\{/gu': 5
  },
  'src/components/molecules/OutdatedPageNotice/index.tsx': {
    "/^import \\w+ from 'icon:[^']+'\\n/gmu": 2
  },
  'src/components/molecules/SiteContent/__tests__/SiteContent.dom.test.tsx': {
    '/SITE.repositoryUrl/gu': 4,
    "/`\\$\\{'https:\\/\\/example.com'\\}#readme`/gu": 2
  },
  'src/components/molecules/ThemeToggle/__tests__/ThemeToggle.browser.test.tsx':
    {
      '/clearThemeCookie/gu': 2
    },
  'src/components/molecules/ThemeToggle/index.tsx': {
    '/\\{ label: (?<label>m\\.\\w+), icon: Icon\\w+ \\}/gu': 3,
    "/^import \\w+ from 'icon:[^']+'\\n/gmu": 4
  },
  'src/components/organisms/ErrorFallback/constants.ts': {
    '/\\},\\n *icon: Icon\\w+/gu': 2,
    "/^import \\w+ from 'icon:[^']+'\\n/gmu": 2
  },
  'src/middleware/__tests__/middleware.node.test.ts': {
    '/^import \\{ (?:MAX_HTML_BYTES|isPublicError|Router) \\}[^\\n]*\\n/gmu': 3
  },
  'src/tests/pages/AgentReadiness/AgentReadiness.content.production.e2e.test.ts':
    {
      "/^ *(?:theme|dark): '[^']+',\\n/gmu": 6,
      "/^ *await expect\\(page.locator\\('html'\\)\\).toHaveClass\\('dark'\\)\\n/gmu": 3
    },
  'src/tests/pages/Home/Home.layout.e2e.test.ts': {
    '/Selecionar tema/gu': 2
  },
  'src/tests/pages/Home/Home.production.e2e.test.ts': {
    '/^ *await expect\\(page\\.locator\\(\'head link\\[rel="canonical"\\]\'\\)\\)[^\\n]*\\n/gmu': 2
  },
  'src/tests/pages/Hydration/Hydration.e2e.test.ts': {
    '/THEME_BUTTON/gu': 3
  },
  'src/tests/pages/I18n/I18n.hydration.e2e.test.ts': {
    '/Selecionar tema/gu': 3,
    '/theme:/gu': 2
  },
  'src/tests/pages/I18n/I18n.production.e2e.test.ts': {
    '/^const (?:REQUESTS|ALTERNATE_LINKS) = \\d+\\n/gmu': 2
  },
  'src/tests/pages/I18n/I18n.redirect.e2e.test.ts': {
    "/await expect\\(\\s*page\\.getByRole\\('button', \\{ name: '[^']+' \\}\\)\\s*\\)\\.toBeEnabled\\(\\)/gu": 5
  },
  'src/tests/pages/UiKit/UiKit.e2e.test.ts': {
    '/narrow dark viewport/gu': 2
  },
  'src/theme/tokens/colors.css': {
    '/light-dark\\(\\s*(?<light>oklch\\([^)]*\\)|var\\([^)]*\\)|color-mix\\([^)]*\\)[^)]*\\))\\s*,\\s*(?:oklch\\([^)]*\\)|var\\([^)]*\\)|color-mix\\([^)]*\\)[^)]*\\))\\s*\\)/gu': 23
  },
  'src/theme/tokens/shadows.css': {
    '/light-dark\\(\\s*(?<light>color-mix\\([^\\n]+?transparent\\)),\\s*(?:transparent|color-mix\\([^\\n]+?transparent\\))\\s*\\)/gu': 2
  },
  'tooling/knip.ts': {
    '/^ *\\/\\/ [^\\n]*(?:robots virtual module|Public configuration and metrics API)[^\\n]*\\n[^\\n]*\\n/gmu': 2
  }
}
