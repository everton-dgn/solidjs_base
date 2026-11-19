import { readFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import { distribution } from '../paths.ts'
import type { GenerationContext, StagedContext } from '../types.ts'

type GuideEdit = { file: string; pattern: RegExp; replacement: string }
type Conventions = {
  edit: (change: GuideEdit) => void
  profile: GenerationContext['profile']
}
function configureClientConventions({ edit, profile }: Conventions): void {
  const agents = 'AGENTS.md'
  edit({
    file: agents,
    pattern:
      /^## JavaScript and server rendering[\s\S]*?(?=^## Translations)/mu,
    replacement:
      '## JavaScript\n\nThe browser renders the application. Test direct page URLs and navigation.\n\n'
  })
  edit({
    file: agents,
    pattern: /`App`, `Document`,\s+`entry-server`, `entry-client`/u,
    replacement: '`App`, `entry-client`'
  })
  if (profile.hasTheme !== false) {
    edit({
      file: agents,
      pattern:
        /Document owns the script element\. Publish its hash in the CSP for each HTML file\./u,
      replacement:
        'The stored-theme plugin emits a same-origin script in the browser build.'
    })
    edit({
      file: 'docs/ui.md',
      pattern: /after the hydration/u,
      replacement: 'after mount'
    })
    edit({
      file: 'docs/ui.md',
      pattern:
        /The initial script reads `app-theme` from local storage before hydration\.[\s\S]*?preferences\./u,
      replacement:
        'The stored-theme plugin applies the saved appearance before the first paint.\nThe switcher saves the preference in local storage.'
    })
  }
  if (profile.hasFonts !== false) {
    edit({
      file: agents,
      pattern: /Render `FontLinks` from[\s\S]*?once in the Document head\./u,
      replacement: 'The build inserts the preload in the HTML head.'
    })
    edit({
      file: 'docs/ui.md',
      pattern: / and rendered by `FontLinks` in\s+`Document.tsx`/u,
      replacement: ' and inserted into the HTML by the build'
    })
  }
}

type HostingReadme = Conventions & {
  isStaticHost: boolean
  deployment: string
  read: (file: string) => string
  write: GenerationContext['write']
}
function configureHostingReadme({
  edit,
  profile,
  isStaticHost,
  deployment,
  read,
  write
}: HostingReadme): void {
  const headers = readFileSync(
    new URL(`headers-${profile.mode}.md`, distribution),
    'utf8'
  )
  const readme = 'README.md'
  const publishing = isStaticHost
    ? readFileSync(
        new URL('static/publishing.md', distribution),
        'utf8'
      ).trimEnd()
    : `## Publishing\n\n${deployment}`
  edit({
    file: readme,
    pattern: /^## See it work[\s\S]*?(?=^## Running it)/mu,
    replacement:
      '## See it work\n\nOpen the home page and use the language menu to visit a localized URL.\n\n'
  })
  edit({
    file: readme,
    pattern:
      /^`vp run dev` serves[\s\S]*?(?=^## What each page and feature shows)/mu,
    replacement: `${publishing}\n\n`
  })
  edit({
    file: readme,
    pattern:
      /^## What each page and feature shows[\s\S]*?(?=^### The same page in three languages)/mu,
    replacement:
      '## What each page and feature shows\n\nThe application includes home, about, contact, privacy and a missing-page view.\n\n'
  })
  edit({
    file: readme,
    pattern:
      /^### Components of the test app[\s\S]*?(?=^## How it is tested)/mu,
    replacement:
      '### Components of the test app\n\nSee the [UI guide](docs/ui.md) for controls and their styles.\n\n'
  })
  edit({
    file: readme,
    pattern: /^## How it is tested[\s\S]*?(?=^### Updating the packages)/mu,
    replacement:
      '## How it is tested\n\nRun `vp run check:ci`, `vp run test` and `vp run test:e2e`.\n\n## Limits\n\nThe interactive controls require JavaScript.\n\n## Reference\n\n'
  })
  edit({
    file: readme,
    pattern: /^### Playwright cases by area[\s\S]*$/mu,
    replacement: `### Guides\n\n- [Architecture](docs/architecture.md)\n- [Development](docs/development.md)\n- [Testing](docs/testing.md)\n- [Translations](docs/i18n.md)\n- [UI](docs/ui.md)\n- [Security](docs/security.md)\n${
      isStaticHost && profile.hasSeo !== false
        ? '- [SEO](docs/seo.md)\n- [Sitemap](docs/seo/sitemap.md)\n\n'
        : '\n'
    }`
  })
  write({
    file: readme,
    content: `${read(readme).trimEnd()}\n\nBun runs application tasks with every installer.\n\n${headers}`
  })
}

type StaticGuideOptions = Pick<Conventions, 'edit'> &
  Pick<GenerationContext, 'write'>
function configureStaticSeoGuides({ edit, write }: StaticGuideOptions): void {
  edit({
    file: 'docs/seo.md',
    pattern: /applications with SSR\./u,
    replacement: 'prerendered applications.'
  })
  edit({
    file: 'docs/seo.md',
    pattern: /locale of the request/u,
    replacement: 'active locale'
  })
  edit({
    file: 'docs/seo.md',
    pattern: /^## Selection for llms.txt[\s\S]*$/mu,
    replacement:
      '## Selection for llms.txt\n\nSet `route.info.llms` on pages to include them in the published indexes.\nSee the [Markdown publication guide](seo/markdown.md).\n\n## Sitemap and dynamic routes\n\nSee the [sitemap guide](seo/sitemap.md), including its [partitioned sources](seo/sitemap.md#partitioned-sources).\n'
  })
  write({
    file: 'docs/seo/markdown.md',
    content:
      '# Markdown publication\n\nPublish the contents of `.output/public` together. The build writes localized\nMarkdown files such as `/pt/about.md`, the index `/llms.txt` and the combined\ntext `/llms-full.txt`. Serve the .md files as `text/markdown; charset=utf-8`.\nLink to their file URLs from clients that read Markdown.\n'
  })
  const sitemap = 'docs/seo/sitemap.md'
  edit({
    file: sitemap,
    pattern: /i18n\.md#seo-indexes/u,
    replacement: 'i18n.md'
  })
  edit({
    file: sitemap,
    pattern: /The route module goes[\s\S]*?(?=The source is ignored)/u,
    replacement: 'Enumerate these paths at build time. '
  })
  edit({
    file: sitemap,
    pattern: / A failure of any source[\s\S]*?(?=With i18n)/u,
    replacement: '\n\n'
  })
  edit({
    file: sitemap,
    pattern: /The four public handlers[\s\S]*?(?=### Partitioned sources)/u,
    replacement: ''
  })
  edit({
    file: sitemap,
    pattern: /the contract, the HTTP service and a test source\./u,
    replacement: 'the partition contract.'
  })
  edit({
    file: sitemap,
    pattern: / The server checks[\s\S]*?(?=\n\nIDs must)/u,
    replacement: ''
  })
  edit({
    file: sitemap,
    pattern:
      /The responses are eventually consistent\.[\s\S]*?(?=The walk through)/u,
    replacement:
      'Publish the index and its parts together after each build.\n\n'
  })
}

export function configureFileHostGuides({
  stage,
  profile,
  write
}: StagedContext): void {
  if (profile.mode !== 'client' && profile.mode !== 'static') return
  const isStaticHost = profile.mode === 'static'
  const deployment = isStaticHost
    ? 'Publish `.output/public` with directory indexes. Return the\nlocalized error page with status 404 when the requested file is missing.'
    : 'Publish `dist` and rewrite page requests to `index.html`.\nThe browser renders the route after it loads the application module.'
  const security = isStaticHost
    ? 'Read `.output/csp-hashes.json` after each build. Apply the hashes for the HTML\nfile returned by the host, including localized error pages. See the README for\nthe policy directives.'
    : 'Configure HTTP response headers on the file host. Serve JavaScript and CSS with\ntheir correct content types. Serve missing asset requests with status 404.'
  const read = (file: string) => readFileSync(path.join(stage, file), 'utf8')
  const edit = ({ file, pattern, replacement }: GuideEdit) =>
    write({
      file,
      content: editTemplate({ file, text: read(file), pattern, replacement })
    })
  edit({
    file: 'docs/security.md',
    pattern: /^## Content policy[\s\S]*?(?=^## HSTS)/mu,
    replacement: `## Content policy\n\n${security}\n\n`
  })
  edit({
    file: 'docs/security.md',
    pattern: /subdomain serves HTTPS,[\s\S]*$/u,
    replacement:
      'subdomain serves HTTPS, then update the header on your host.\n'
  })
  const development = 'docs/development.md'
  edit({
    file: development,
    pattern:
      /^## Environment and preview[\s\S]*?(?=^## Styles on the first load)/mu,
    replacement: `## Build and deploy\n\nRun \`vp run build\`. ${deployment}\n\n`
  })
  edit({
    file: development,
    pattern:
      /^## Styles on the first load[\s\S]*?(?=^## (?:Reactivity diagnostics|Scripts))/mu,
    replacement: ''
  })
  edit({
    file: development,
    pattern:
      / The server\s+configuration limits `loadEnv`[\s\S]*?record the whole environment\./u,
    replacement: ''
  })
  edit({
    file: development,
    pattern: /TypeScript configs, `package.json`, `bun\.lock`/u,
    replacement: 'TypeScript configs, `package.json`, the installer lockfile'
  })
  edit({
    file: development,
    pattern: /^## Runtimes and CI[\s\S]*?(?=^## Git hooks)/mu,
    replacement: ''
  })
  edit({
    file: development,
    pattern: /^\| `vp run test:e2e:production`[^\n]*\n/mu,
    replacement: ''
  })
  edit({
    file: development,
    pattern: /Nitro build for Vercel in `\.vercel\/output\/`/u,
    replacement: (isStaticHost
      ? 'Prerender the application files'
      : 'Build the browser application'
    ).padEnd('Nitro build for Vercel in `.vercel/output/`'.length)
  })
  edit({
    file: 'docs/testing.md',
    pattern:
      /^## Full application tests[\s\S]*?(?=^## Checking on a physical device)/mu,
    replacement:
      '## Full application tests\n\nRun `vp run build` and `vp run test:e2e` to check the built application in\nChromium.\n\n'
  })
  configureHostingReadme({
    edit,
    profile,
    isStaticHost,
    deployment,
    read,
    write
  })
  const architecture = 'docs/architecture.md'
  edit({
    file: architecture,
    pattern:
      /^## Routes and organization[\s\S]*?(?=^## Cohesion of the tooling modules)/mu,
    replacement:
      '## Routes and organization\n\nPages and layouts live in `src/routes`. Colocate page-specific helpers, styles\nand tests with their consumers.\n\n'
  })
  edit({
    file: architecture,
    pattern: /^## Data and infrastructure[\s\S]*?(?=^## Component layers)/mu,
    replacement: ''
  })
  edit({
    file: architecture,
    pattern: /The entries are [\s\S]*?(?=\n\nIn the diagnostics)/u,
    replacement:
      'Application entries assemble the route and component layers. Tests can import\nthe layers they check. Generated declarations stay outside the lint.'
  })
  edit({
    file: architecture,
    pattern: / The layer lint does not replace[\s\S]*?contract\./u,
    replacement: ''
  })
  if (isStaticHost && profile.hasSeo !== false) {
    configureStaticSeoGuides({ edit, write })
  }
  const i18n = 'docs/i18n.md'
  edit({
    file: i18n,
    pattern:
      /^## Negotiation and isolation on the server[\s\S]*?(?=^## Runtime navigation and language tags)/mu,
    replacement:
      '## Navigation\n\nThe current URL selects the language. Use a locale prefix to link directly to a\npage, such as `/pt/about`.\n\n'
  })
  edit({
    file: development,
    pattern: /, of the tooling tests and of the production SSR/u,
    replacement: ' and the tooling tests'
  })
  edit({
    file: development,
    pattern: /When raising the Node line,[\s\S]*?in the same commit\.\n\n/u,
    replacement: ''
  })
  edit({
    file: development,
    pattern: /; Nitro comes from the tooling\s+package/u,
    replacement: ''
  })
  edit({
    file: 'docs/testing.md',
    pattern: /Server functions, middleware, utilities/u,
    replacement: 'Utilities'
  })
  edit({
    file: 'docs/testing.md',
    pattern: /, without Nitro or the SSR configuration/u,
    replacement: ''
  })
  edit({
    file: i18n,
    pattern: /: SSR shares modules between requests/u,
    replacement: ''
  })
  edit({
    file: i18n,
    pattern: /Those browsers fetch the polyfill[\s\S]*?(?=\n\n## Navigation)/u,
    replacement:
      'Browsers without the native API load the polyfill before mounting the page.'
  })
  const agents = 'AGENTS.md'
  edit({
    file: agents,
    pattern:
      /- Keep `AsyncLocalStorage`,[\s\S]*?tolerance to blocked cookies\.\n/u,
    replacement: ''
  })
  edit({
    file: agents,
    pattern: /the top of a module shared between SSR\s+requests/u,
    replacement: 'the top of a shared module'
  })
  if (!isStaticHost) configureClientConventions({ edit, profile })
  if (!isStaticHost) {
    const ui = 'docs/ui.md'
    edit({
      file: ui,
      pattern: /^## CSS processing\n[\s\S]*?(?=^## |(?![\s\S]))/mu,
      replacement:
        '## CSS processing\n\nVite builds component stylesheets and CSS modules for the browser.\n\n'
    })
    edit({
      file: ui,
      pattern: /A modal that starts open becomes modal after the\nhydration\./u,
      replacement: 'A modal that starts open takes focus after the\nmount.'
    })
    write({ file: ui, content: `${read(ui).trimEnd()}\n` })
  }
  edit({
    file: agents,
    pattern: /^## Security headers and CSP\n[\s\S]*?(?=^## |(?![\s\S]))/mu,
    replacement:
      '## Hosting and security\n\nSee `docs/security.md` for the host configuration.\n\n'
  })
  edit({
    file: agents,
    pattern: /^## Command runtime\n[\s\S]*?(?=^## )/mu,
    replacement:
      '## Command runtime\n\nBun runs application tasks with every installer.\n\n'
  })
}
