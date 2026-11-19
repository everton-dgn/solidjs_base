import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import type { GenerationContext } from './generate.ts'

export function configureClient(
  stage: string,
  { profile, pkg, write }: GenerationContext
): void {
  if (profile.mode !== 'client') return
  for (const file of [
    'src/entry-server.tsx',
    'src/Document.tsx',
    'src/middleware',
    'tooling/testing/serve-public.ts'
  ]) {
    rmSync(path.join(stage, file), { recursive: true, force: true })
  }
  const read = (file: string) => readFileSync(path.join(stage, file), 'utf8')
  write(
    'vite.config.ts',
    read('vite.config.ts')
      .replace(/^ *middleware: [^\n]+\n/mu, '')
      .replace("output: 'static'", 'ssr: false')
  )
  write(
    'tooling/knip.ts',
    read('tooling/knip.ts').replace(
      /^ *'tooling\/testing\/serve-public.ts',\n/mu,
      ''
    )
  )
  write(
    'playwright.config.ts',
    read('playwright.config.ts').replace(
      'node tooling/testing/serve-public.ts',
      'vp preview --host 127.0.0.1 --port 4317 --strictPort'
    )
  )
  pkg.scripts.start = 'vp preview'
  write(
    'src/entry-client.tsx',
    `import { render } from '@solidjs/web'

import App from './App.tsx'
import { SITE } from './constants/site/index.ts'
import { installOutdatedPageDetection } from './entry-client/installOutdatedPageDetection/index.ts'

import './theme/globalStyles.css'

document.documentElement.lang = SITE.locale
const dispose = installOutdatedPageDetection()
if (import.meta.hot) import.meta.hot.dispose(dispose)
render(() => <App />, document.body)
`
  )
  write(
    'index.html',
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SolidJS Boilerplate</title>
  </head>
  <body>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
`
  )
  write(
    'README.md',
    `# Solid application

Install dependencies with the package manager in \`package.json\`. Bun runs the
application tasks with every installer.

Run \`vp run dev\` for development. Build with \`vp run build\` and publish the
contents of \`dist\`. Configure the host to serve \`index.html\` for page routes
such as \`/en/about\`. Serve asset requests from their original paths.
`
  )
}
