import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { GenerationContext } from './generate.ts'

export function configureFileHostGuides(
  stage: string,
  { profile, write }: GenerationContext
): void {
  if (profile.mode !== 'client' && profile.mode !== 'static') return
  const staticHost = profile.mode === 'static'
  const deployment = staticHost
    ? 'Publish `.output/public` with directory indexes. Return the\nlocalized error page with status 404 when the requested file is missing.'
    : 'Publish `dist` and rewrite page requests to `index.html`.\nThe browser renders the route after it loads the application module.'
  const security = staticHost
    ? 'Read `.output/csp-hashes.json` after each build. Apply the hashes for the HTML\nfile returned by the host, including localized error pages. See the README for\nthe policy directives.'
    : 'Configure HTTP response headers on the file host. Serve JavaScript and CSS with\ntheir correct content types. Serve missing asset requests with status 404.'
  write('docs/security.md', `# Hosting and security\n\n${security}\n`)
  write(
    'docs/development.md',
    `# Development\n\nInstall the dependencies and run \`vp run dev\`. Bun runs the application tasks\nwith every supported installer. Use \`vp run check:ci\` to check source files and\n\`vp run test\` to run the application tests.\n\n## Build and deploy\n\nRun \`vp run build\`. ${deployment}\n${profile.diagnostics === false ? '' : '\n## Reactivity diagnostics in development\n\nOpen `/__solid/diagnostics` on the development server to inspect reactivity.\n'}`
  )
  write(
    'docs/testing.md',
    '# Testing\n\nRun `vp run test` for the unit and component suites. Run `vp run build`, then\n`vp run test:e2e` to open the production output in Chromium. The browser test\nopens the home page and follows a direct URL to a localized page.\n'
  )
  const read = (file: string) => readFileSync(path.join(stage, file), 'utf8')
  const architecture = 'docs/architecture.md'
  const layers = read(architecture)
    .split('## Component layers')
    .at(1)
    ?.split('The layer lint does not replace')[0]
    ?.trimEnd()
  write(
    architecture,
    `# Architecture\n\nPage components live in \`src/routes\`. The filesystem router finds each page and\nits layout. Shared components live in \`src/components\`. Keep local styles and\ntests with their component.\n\n## Component layers${layers}\n`
  )
  if (staticHost && profile.seo !== false) {
    write(
      'docs/seo/sitemap.md',
      '# Sitemap\n\nThe build writes the sitemap into `.output/public`. It lists the published page\nURLs for each language. Use the public origin of the deployment when building\nthe application.\n'
    )
  }
  const i18n = 'docs/i18n.md'
  const catalogs = read(i18n)
    .split('## Generation and validation')
    .at(0)
    ?.trimEnd()
  write(
    i18n,
    `${catalogs}\n\n## Navigation\n\nThe URL selects the language. Use a locale prefix when linking directly to a\npage, such as \`/pt/about\`.\n`
  )
  const agents = 'AGENTS.md'
  if (!staticHost) {
    const ui = 'docs/ui.md'
    const sections = read(ui).split(/^## /mu)
    const controls = sections.map(section =>
      section.startsWith('CSS processing\n')
        ? 'CSS processing\n\nVite builds component stylesheets and CSS modules for the browser.\n\n'
        : section.replace(
            'A modal that starts open becomes modal after the\nhydration.',
            'A modal that starts open takes focus after the\nmount.'
          )
    )
    write(ui, `${controls.join('## ').trimEnd()}\n`)
  }
  write(
    agents,
    read(agents)
      .replace(
        /^## Security headers and CSP\n[\s\S]*?(?=^## |$(?![\s\S]))/mu,
        '## Hosting and security\n\nSee `docs/security.md` for the host configuration.\n\n'
      )
      .replace(
        /^## Command runtime\n[\s\S]*?(?=^## )/mu,
        '## Command runtime\n\nBun runs application tasks with every installer.\n\n'
      )
  )
}
