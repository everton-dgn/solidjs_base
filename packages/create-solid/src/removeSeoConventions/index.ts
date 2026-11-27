import { editTemplate } from '../edit-template.ts'

type ConventionEdit = {
  name: string
  pattern: RegExp
  replacement: string
}
const conventions: ConventionEdit[] = [
  {
    name: 'initial HTML tests',
    pattern: /Keep SSR, SEO and the initial HTML tests/u,
    replacement: 'Keep SSR and the initial HTML tests'
  },
  {
    name: 'translated getters',
    pattern: /where the API accepts one, such as the `title` of `seo`/u,
    replacement: 'where the API accepts one'
  },
  {
    name: 'HTML language tags',
    pattern: /for HTML and SEO tags/u,
    replacement: 'for HTML language tags'
  },
  {
    name: 'typed page paths',
    pattern: /`localizeHref\(\)` is for composing SEO and index URLs\. /u,
    replacement: ''
  },
  {
    name: 'merged interfaces',
    pattern:
      /, `ImportMetaEnv` in `src\/@types\/env\.d\.ts` and\n *`RouteInfo` in the runtime `seo\/\{sitemap,markdown,llms\}\/router\.d\.ts` modules/u,
    replacement: ' and `ImportMetaEnv` in `src/@types/env.d.ts`'
  },
  {
    name: 'single-consumer constants',
    pattern:
      / SEO preset data is kept with the site config in\n *`src\/constants\/site\/robots\.ts`; the route itself only re-exports the runtime\./u,
    replacement: ''
  },
  {
    name: 'route-local modules',
    pattern:
      /(?<rule>- A route that starts needing local modules becomes a folder with `index\.ts`):[\s\S]*?without pulling the server factory into route metadata\./u,
    replacement: '$<rule>. Keep its local modules beside the entry.'
  },
  {
    name: 'page modules',
    pattern: /- Import `SeoRouteInfo`[\s\S]*?(?=- Localized texts and links)/u,
    replacement: ''
  },
  {
    name: 'page data',
    pattern: /- `seo\.ts` lives next to[\s\S]*?(?=## Function parameters)/u,
    replacement:
      '- Set the translated page title with `useHead` in the route component in `index.tsx`. Keep the page body and its UI data there.\n\n'
  },
  {
    name: 'middleware composition',
    pattern:
      /the application supplies Markdown as `document` and the E2E entry extends/u,
    replacement: 'the E2E entry extends'
  },
  {
    name: 'static asset headers',
    pattern:
      / The `\.md` files come in[\s\S]*?\(docs\/security\.md#known-limits\)\)\./u,
    replacement: ''
  }
]

export function removeSeoConventions(input: string): string {
  let text = input
  for (const { name, pattern, replacement } of conventions) {
    text = editTemplate({
      file: `AGENTS.md (${name})`,
      text,
      pattern,
      replacement
    })
  }
  return text
}
