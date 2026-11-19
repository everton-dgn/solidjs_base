import {
  applyProfileRules,
  type ProfileRuleGroup,
  type ProfileText
} from '../apply-profile-rules.ts'

const messages = '@/constants/messages/index.ts'
const seam = '@evertondgn/solid-runtime/i18n/locale'
const groups: readonly ProfileRuleGroup[] = [
  {
    files: [
      'src/__tests__/App.dom.test.tsx',
      'src/components/atoms/ToastProvider/__tests__/ToastProvider.browser.test.tsx',
      'src/components/atoms/ToastProvider/__tests__/ToastProvider.dom.test.tsx',
      'src/components/atoms/ToastProvider/index.tsx',
      'src/components/molecules/Dialog/__tests__/Dialog.browser.test.tsx',
      'src/components/molecules/Dialog/index.tsx',
      'src/components/molecules/OutdatedPageNotice/__tests__/OutdatedPageNotice.dom.test.tsx',
      'src/components/molecules/OutdatedPageNotice/index.tsx',
      'src/components/molecules/SiteContent/index.tsx',
      'src/components/molecules/ThemeToggle/__tests__/ThemeToggle.browser.test.tsx',
      'src/components/molecules/ThemeToggle/index.tsx',
      'src/components/organisms/ErrorFallback/__tests__/ErrorFallback.dom.test.tsx',
      'src/components/organisms/ErrorFallback/constants.ts',
      'src/components/organisms/ErrorFallback/index.tsx',
      'src/components/organisms/Topbar/index.tsx',
      'src/constants/siteLinks/index.ts',
      'src/helpers/resolveSiteUrl/__tests__/resolveSiteUrl.node.test.ts',
      'src/infra/server/configureServerErrors/__tests__/configureServerErrors.messages.node.test.ts',
      'src/infra/server/configureServerErrors/index.ts',
      'src/middleware/__tests__/middleware.node.test.ts',
      'src/middleware/markdownContent/__tests__/markdownContent.serialization.node.test.ts',
      'src/middleware/markdownContent/index.ts',
      'src/routes/(base)/(home)/index.tsx',
      'src/routes/(base)/(home)/seo.ts',
      'src/routes/(base)/[...404]/seo.ts',
      'src/routes/(base)/about/index.tsx',
      'src/routes/(base)/about/seo.ts',
      'src/routes/(base)/contact/index.tsx',
      'src/routes/(base)/contact/seo.ts',
      'src/routes/(base)/privacy/index.tsx',
      'src/routes/(base)/privacy/seo.ts',
      'src/routes/(seo)/llms.txt/__tests__/llms.txt.node.test.ts',
      'src/tests/helpers/scenarioLocales/index.ts',
      'src/tests/helpers/themeLabels/index.ts',
      'src/tests/pages/BackendError/BackendError.e2e.test.ts',
      'src/tests/pages/Home/Home.seo.e2e.test.ts',
      'src/tests/pages/Hydration/Hydration.e2e.test.ts',
      'src/tests/pages/Hydration/Hydration.streaming.e2e.test.ts',
      'src/tests/pages/OutsideError/OutsideError.e2e.test.ts'
    ],
    rules: [['@paraglide/messages.js', messages]]
  },
  {
    files: ['src/constants/site/index.ts'],
    hasSeo: true,
    rules: [['@paraglide/messages.js', messages]]
  },
  {
    files: ['src/routes/(base)/[...404]/index.tsx'],
    hasSeo: false,
    rules: [['@paraglide/messages.js', messages]]
  },
  {
    files: [
      'src/components/molecules/SiteContent/__tests__/SiteContent.dom.test.tsx',
      'src/components/organisms/ErrorFallback/__tests__/ErrorFallback.dom.test.tsx',
      'src/constants/site/index.ts',
      'src/helpers/resolveSiteUrl/__tests__/resolveSiteUrl.node.test.ts',
      'src/infra/server/configureServerErrors/__tests__/configureServerErrors.messages.node.test.ts',
      'src/infra/server/configureServerErrors/index.ts',
      'src/middleware/markdownContent/__tests__/markdownContent.abort.node.test.ts',
      'src/middleware/markdownContent/__tests__/markdownContent.protocol.node.test.ts',
      'src/middleware/markdownContent/__tests__/markdownContent.serialization.node.test.ts',
      'src/primitives/createOutdatedPageGuard/__tests__/createOutdatedPageGuard.dom.test.tsx',
      'src/primitives/createOutdatedPageGuard/__tests__/createOutdatedPageGuard.initial.dom.test.tsx',
      'src/routes/(seo)/llms.txt/__tests__/llms.txt.node.test.ts',
      'src/routes/(seo)/llms.txt/constants.ts',
      'src/tests/fixtures/e2e/routes/(base)/markdown-contract/[slug].tsx',
      'src/tests/fixtures/e2e/routes/(base)/ui-kit/index.tsx'
    ],
    rules: [['@paraglide/runtime.js', seam]]
  },
  {
    files: ['src/middleware/__tests__/middleware.node.test.ts'],
    hasSeo: false,
    rules: [['@paraglide/runtime.js', seam]]
  },
  {
    files: ['src/middleware/__tests__/middleware.node.test.ts'],
    hasSeo: true,
    expectedMatches: 2,
    rules: [['@paraglide/runtime.js', seam]]
  },
  {
    files: [
      'src/components/molecules/SiteContent/index.tsx',
      'src/components/organisms/ErrorFallback/index.tsx',
      'src/components/organisms/Topbar/NavItem/index.tsx',
      'src/components/organisms/Topbar/index.tsx',
      'src/tests/fixtures/e2e/routes/(base)/outdated-page.tsx',
      'src/tests/fixtures/e2e/routes/(base)/ui-kit/index.tsx'
    ],
    rules: [[/^import \{ LocalizedLink \}[^\n]+\n/mu, '']]
  },
  {
    files: [
      'src/components/molecules/SiteContent/index.tsx',
      'src/components/organisms/ErrorFallback/index.tsx',
      'src/components/organisms/Topbar/NavItem/index.tsx',
      'src/components/organisms/Topbar/index.tsx'
    ],
    expectedMatches: 2,
    rules: [[/<(?<close>\/?)LocalizedLink\b/gu, '<$<close>a']]
  },
  {
    files: ['src/tests/fixtures/e2e/routes/(base)/outdated-page.tsx'],
    expectedMatches: 4,
    rules: [[/<(?<close>\/?)LocalizedLink\b/gu, '<$<close>a']]
  },
  {
    files: ['src/tests/fixtures/e2e/routes/(base)/ui-kit/index.tsx'],
    expectedMatches: 6,
    rules: [[/<(?<close>\/?)LocalizedLink\b/gu, '<$<close>a']]
  },
  {
    files: ['src/components/organisms/ErrorFallback/index.tsx'],
    rules: [
      [
        "href={props.kind === 'runtime' ? '' : paths}",
        "href={props.kind === 'runtime' ? '' : '/'}"
      ],
      [
        /^import \{ paths \} from '@\/router.ts'\n(?=[\s\S]*href=\{props.kind)/mu,
        ''
      ]
    ]
  },
  {
    files: ['src/App.tsx'],
    rules: [
      [/^import \{ createLocaleNavigationGuard \}[^\n]+\n/mu, ''],
      [/^ +createLocaleNavigationGuard\(\)\n/mu, '']
    ]
  },
  {
    files: ['src/constants/site/index.ts', 'src/primitives/createSeo/index.ts'],
    rules: [[/^import \{ LOCALE_TAG_OVERRIDES \}[^\n]+\n/mu, '']]
  },
  {
    files: ['src/primitives/createSeo/index.ts'],
    rules: [[/^ +localeTagOverrides: LOCALE_TAG_OVERRIDES,\n/mu, '']]
  },
  {
    files: ['src/constants/site/index.ts'],
    rules: [[/^import \{ localeTag \}[^\n]+\n/mu, '']]
  },
  {
    files: [
      'src/primitives/createOutdatedPageGuard/index.ts',
      'src/router.ts',
      'src/tests/fixtures/e2e/middleware/index.ts'
    ],
    rules: [[/^import \{ delocalizePathname \}[^\n]+\n/mu, '']]
  },
  {
    files: ['src/router.ts'],
    rules: [[/,\n {2}transformUrl: delocalizePathname/u, '']]
  },
  {
    files: ['src/tests/fixtures/e2e/middleware/index.ts'],
    rules: [
      [
        'const pathname = delocalizePathname(url.pathname)',
        'const { pathname } = url'
      ]
    ]
  },
  {
    files: ['src/primitives/createOutdatedPageGuard/index.ts'],
    expectedMatches: 2,
    rules: [[/delocalizePathname\((?<pathname>[\w.]+)\)/gu, '$<pathname>']]
  },
  {
    files: [
      'src/routes/(seo)/llms.txt/constants.ts',
      'src/tests/fixtures/e2e/late-redirect/throwLateRedirect/index.ts'
    ],
    rules: [[/^import \{ localizeHref \}[^\n]+\n/mu, '']]
  },
  {
    files: ['src/tests/fixtures/e2e/late-redirect/throwLateRedirect/index.ts'],
    rules: [[/localizeHref\(\{ href: (?<href>'[^']+') \}\)/u, '$<href>']]
  },
  {
    files: ['src/tests/fixtures/e2e/control-signal/throwRedirect/index.ts'],
    rules: [
      [
        "import { localizedRedirect } from '@evertondgn/solid-runtime/i18n/localized-redirect'",
        "import { redirect } from '@solidjs/web'"
      ],
      [
        /localizedRedirect\(\{ href: (?<href>'[^']+') \}\)/u,
        'redirect($<href>)'
      ]
    ]
  }
]

export function configurePlainSource(options: ProfileText): string {
  return applyProfileRules({ ...options, groups })
}
