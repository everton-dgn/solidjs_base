import { cpSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { editTemplate } from '../edit-template.ts'
import { distribution } from '../paths.ts'
import { removeFeatureFiles } from '../removeFeatureFiles/index.ts'
import type { StagedContext } from '../types.ts'

export function configureClient({
  stage,
  profile,
  pkg,
  write
}: StagedContext): void {
  if (profile.mode !== 'client') return
  delete pkg.dependencies.valibot
  removeFeatureFiles({ stage, disabled: [], group: 'clientExcludes' })
  rmSync(path.join(stage, 'tooling/testing/serve-public.ts'))
  const read = (file: string) => readFileSync(path.join(stage, file), 'utf8')
  const file = 'vite.config.ts'
  let vite = editTemplate({
    file,
    text: read(file),
    pattern: /^ *middleware: [^\n]+\n/mu,
    replacement: ''
  })
  vite = editTemplate({
    file,
    text: vite,
    pattern: "output: 'static'",
    replacement: 'ssr: false'
  })
  if (profile.hasTheme !== false) {
    cpSync(new URL('client/theme/', distribution), stage, {
      recursive: true
    })
    vite = editTemplate({
      file,
      text: vite,
      pattern: 'export default defineSolidApp({',
      replacement:
        "import { storedTheme } from './tooling/stored-theme.ts'\n\nexport default defineSolidApp({"
    })
    vite = editTemplate({
      file,
      text: vite,
      pattern: '  ssr: false',
      replacement:
        '  extend: () => ({ plugins: [storedTheme()] }),\n  ssr: false'
    })
    // Local imports form one group when the application also configures fonts.
    if (profile.hasFonts !== false) {
      vite = editTemplate({
        file,
        text: vite,
        pattern: "from './fonts.ts'\n\nimport { storedTheme",
        replacement: "from './fonts.ts'\nimport { storedTheme"
      })
    }
  }
  write({ file, content: vite })
  const playwright = 'playwright.config.ts'
  write({
    file: playwright,
    content: editTemplate({
      file: playwright,
      text: read(playwright),
      pattern: 'node tooling/testing/serve-public.ts',
      replacement: 'vp preview --host 127.0.0.1 --port 4317 --strictPort'
    })
  })
  const knip = 'tooling/knip.ts'
  const entry = editTemplate({
    file: knip,
    text: read(knip),
    pattern: '  root:',
    replacement: "  solidPluginImport: 'static',\n  root:"
  })
  write({
    file: knip,
    content: editTemplate({
      file: knip,
      text: entry,
      pattern: "'server-only', ",
      replacement: ''
    })
  })
  pkg.scripts.start = 'vp preview'
  write({
    file: 'src/entry-client.tsx',
    content: `import { render } from '@solidjs/web'

import App from './App.tsx'
import { SITE } from './constants/site/index.ts'
import { installOutdatedPageDetection } from './entry-client/installOutdatedPageDetection/index.ts'

import './theme/globalStyles.css'

document.documentElement.lang = SITE.locale
const dispose = installOutdatedPageDetection()
if (import.meta.hot) import.meta.hot.dispose(dispose)
render(() => <App />, document.body)
`
  })
  write({
    file: 'index.html',
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#ffffff" />
    <link rel="icon" href="/favicon/favicon.ico" sizes="16x16 32x32" />
    <link rel="icon" href="/favicon/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/favicon/apple-touch-icon.png" />
    <title>SolidJS Boilerplate</title>
  </head>
  <body>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
`
  })
}
