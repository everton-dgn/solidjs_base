import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'

type GuideEdit = readonly [name: string, anchor: RegExp, replacement: string]
const guides: Record<string, GuideEdit[]> = {
  'README.md': [
    [
      'localized page copy',
      /with `lang`, the navigation and\nthe metadata in that language/u,
      'with `lang` and navigation in that language'
    ],
    [
      'page demonstration',
      /^## See it work[\s\S]*?(?=^## Running it)/mu,
      '## See it work\n\nOpen the home page and follow a link to a localized page.\n\n'
    ],
    [
      'production headers',
      /nonce that changes on every request\.[\s\S]*?(?=The \[scripts table\])/u,
      'nonce that changes on every request. '
    ],
    ['application pages', /five pages and its SEO routes/u, 'five pages'],
    ['page features', /, `seo\.ts` metadata/u, ''],
    ['publication row', /^\| SEO and Markdown[^\n]*\n/mu, ''],
    [
      'test results',
      /^## How it is tested[\s\S]*?(?=^## Reference)/mu,
      '## How it is tested\n\nRun `vp run test` for unit and component tests and `vp run test:e2e` for the\nbrowser suite.\n\n## Limits\n\nInteractive controls require JavaScript.\n\n'
    ],
    [
      'environment configuration',
      / The SEO preset validates[\s\S]*?(?=`ImportMetaEnv` declares only)/u,
      ' '
    ],
    [
      'runtime factories',
      /Middleware, security headers, server errors,[\s\S]*?(?=### Updating the packages)/u,
      'The runtime supplies the middleware and locale navigation. The application\nprovides its own header values and public messages.\n\n'
    ],
    [
      'test inventory',
      /^### Playwright cases by area[\s\S]*?(?=^### Guides)/mu,
      '### Playwright cases by area\n\nRun `vp run test:e2e --list` to list the cases in this application.\n\n'
    ],
    [
      'publication guides',
      /^\| \[(?:SEO and site indexes|Sitemap and content sources|Markdown and reading by agents|Editorial indexes, endpoints and cache|Publication artifacts and capacity)\][^\n]*\n/gmu,
      ''
    ]
  ],
  'docs/architecture.md': [
    [
      'router providers',
      /provider, the SEO and the global boundary/u,
      'provider and the global boundary'
    ],
    ['method restrictions', /, such as `POST \/robots\.txt`/u, ''],
    [
      'route groups',
      / So `\(seo\)\/sitemap.xml\/index.ts` serves `\/sitemap.xml`; brackets\s+still mark/u,
      ' Brackets mark'
    ],
    [
      'publication services',
      /The application binds the Markdown adapter[\s\S]*?in the runtime package\.\n\n/u,
      ''
    ]
  ],
  'docs/development.md': [
    [
      'environment schema',
      /The\s+copy enables the preset's `seo` option[\s\S]*?application code imports it\. /u,
      ''
    ],
    ['runtime origin', / `SITE.url` imports the runtime SEO origin\./u, ''],
    [
      'preview variables',
      /, used by both dev and preview, and\s+`VITE_SITE_URL`, the required public URL of the SEO metadata\./u,
      ', used by both dev and preview.'
    ],
    [
      'image cache',
      / and keeps only the `Content-Type`[\s\S]*?middleware\. The Vercel configuration/u,
      '. The Vercel configuration'
    ]
  ],
  'docs/i18n.md': [
    ['message getters', / and in `route.info.seo`, as in the 404/u, ''],
    [
      'catalog compiler',
      / The Markdown snapshots of the\s+static pages[\s\S]*?production requests of the static pages\./u,
      ''
    ],
    ['request language', /, SEO and hydration/u, ' and hydration'],
    [
      'localized artifacts',
      / The Markdown snapshots\s+are localized files[\s\S]*?localization of pages\./u,
      ''
    ],
    [
      'locale negotiation',
      /, so that pages excluded from the Markdown negotiation\s+also render in the locale of the URL/u,
      ''
    ],
    ['history locale', /messages, document and SEO/u, 'messages and document'],
    [
      'URL builder',
      / to build SEO and index URLs,[\s\S]*?It hands the building of the URL/u,
      '. It hands the building of the URL'
    ],
    [
      'locale indexes',
      /^## SEO indexes[\s\S]*?(?=^## Runtime request step)/mu,
      ''
    ],
    [
      'request helpers',
      / Markdown response\s+helpers use the same factory and security header instance\./u,
      ''
    ],
    [
      'language tags',
      /in HTML, Open\s+Graph and JSON-LD\.[\s\S]*?calling the function\./u,
      'in HTML.'
    ]
  ],
  'docs/security.md': [
    [
      'middleware consumers',
      /the chain, the failure\s+containment, the locale step and the uncached Markdown responses/u,
      'the chain, failure containment and the locale step'
    ],
    ['middleware chain', /, document: markdownContent/u, ''],
    [
      'non-HTML policy',
      / That way, robots and the dynamic sitemap[\s\S]*?CSP of the middleware\./u,
      ''
    ],
    [
      'CDN assets',
      /static files \(`\/assets\/`,[\s\S]*?generated in the build\)/u,
      'static assets'
    ],
    [
      'asset caching',
      /`\/assets\/` and `\/images\/` are `publicAssets`/u,
      '`/assets/` is served'
    ],
    [
      'asset MIME override',
      /`vercel.json` keeps only the `Content-Type`[\s\S]*?with it\. The/u,
      'The'
    ]
  ],
  'docs/testing.md': [
    [
      'test subjects',
      /; subjects\s+with a dot, such as\s+`llms.txt`, are valid too/u,
      ''
    ],
    [
      'middleware tests',
      /The application retains its\s+Markdown suites, and /u,
      ''
    ],
    [
      'load suite',
      /^### Publication load[\s\S]*?(?=^`hydrationFinished\(\)`)/mu,
      ''
    ],
    [
      'route fixtures',
      / and\s+`export \{ GET \} from '@\/routes\/\(seo\)\/robots.txt\/index.ts'`/u,
      ''
    ],
    [
      'production suite',
      /That suite checks over HTTP that[\s\S]*?(?=`BuildOutput.production.e2e.test.ts`)/u,
      'The suite checks the headers on the home page. '
    ],
    [
      'middleware coverage',
      /The Node tests of the middleware cover[\s\S]*?(?=`Home.csp.production.e2e.test.ts`)/u,
      ''
    ]
  ],
  'docs/server-errors.md': [
    [
      'local services',
      /`requestJson`, `publication`, `sitemapSources`, the Markdown adapter and/u,
      '`requestJson` and'
    ],
    ['middleware binding', /security, extra, document/u, 'security, extra'],
    ['security instance', / and Markdown adapter/u, ''],
    ['request formats', /allows HTML or Markdown/u, 'allows HTML'],
    [
      'HTML response',
      /;\s+a client that asks only for Markdown also gets the error page in HTML\./u,
      '.'
    ],
    [
      'outer containment',
      / and of the\s+Markdown adapter before the render,[\s\S]*?such as `robots.txt`/u,
      ''
    ],
    [
      'error locale',
      / The Markdown adapter also runs outside[\s\S]*?as `localizeRequest`\./u,
      ''
    ],
    ['publication integrity', /\n## SSR integrity for Markdown[\s\S]*$/u, '']
  ],
  'docs/server-errors/backend.md': [
    [
      'publication adapters',
      /The sitemap sources[\s\S]*?(?=Never copy `error.message`)/u,
      ''
    ]
  ],
  'docs/server-errors/logging.md': [
    ['grouped route frame', /src\/routes\/\(seo\)\//u, 'src/routes/(base)/'],
    [
      'publication failures',
      /- The runtime sitemap service[\s\S]*?(?=The `\[middleware\]`)/u,
      '\n'
    ]
  ]
}

export function removeSeoGuideCopy(stage: string): void {
  for (const [file, edits] of Object.entries(guides)) {
    const target = path.join(stage, file)
    if (!existsSync(target)) continue
    let text = readFileSync(target, 'utf8')
    for (const [name, pattern, replacement] of edits) {
      text = editTemplate({
        file: `${file} (${name})`,
        text,
        pattern,
        replacement
      })
    }
    writeFileSync(target, text)
  }
}
