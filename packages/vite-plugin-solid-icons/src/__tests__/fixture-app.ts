import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import solid from '@solidjs/vite-plugin'
import type { InlineConfig } from 'vite-plus'

import { solidIcons } from '../index.ts'

type FixtureFiles = Record<string, string>
type ConfigInput = { root: string; isSsr: boolean }

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')

const STAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="red" d="M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z"/></svg>\n'
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>\n'

const APP = `import Github from 'icon:hugeicons/github'
import githubSvg from 'icon:hugeicons/github?raw'
import Logo from 'icon:own/logo.v2'
import Star from 'icon:own/star'

export default function App() {
  return (
    <main>
      <Github data-icon="github" />
      <Star data-icon="star" />
      <Logo data-icon="logo" />
      <output id="raw">{githubSvg}</output>
    </main>
  )
}
`

const FILES: FixtureFiles = {
  'index.html':
    '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/entry-client.tsx"></script></body></html>\n',
  'src/App.tsx': APP,
  'src/entry-client.tsx': `import { render } from '@solidjs/web'
import App from './App.tsx'

render(() => <App />, document.querySelector('#app')!)
`,
  'src/entry-server.tsx': `import { renderToString } from '@solidjs/web'
import App from './App.tsx'

export const html = () => renderToString(() => <App />)
`,
  'icons/star.svg': STAR_SVG,
  'icons/logo.v2.svg': LOGO_SVG
}

export const STAR_FILE = 'icons/star.svg'

// A Solid 2 application in a temporary folder. Its node_modules points at the
// one of this package, so Vite resolves Solid and the collections from there.
export async function createFixtureApp(): Promise<string> {
  const prefix = path.join(tmpdir(), 'solid-icons-app-')
  const root = await realpath(await mkdtemp(prefix))
  await symlink(
    path.join(PACKAGE_ROOT, 'node_modules'),
    path.join(root, 'node_modules')
  )
  for (const [file, content] of Object.entries(FILES)) {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return root
}

export function fixtureConfig({ root, isSsr }: ConfigInput): InlineConfig {
  return {
    root,
    configFile: false,
    // Each application optimizes its dependencies in its own folder, away
    // from the node_modules it shares with the other tests.
    cacheDir: '.vite',
    logLevel: 'error',
    plugins: [
      solidIcons({
        collections: { own: './icons' },
        customizeIcon: ({ attributes }) => {
          attributes['aria-hidden'] = 'true'
        }
      }),
      solid({ ssr: isSsr })
    ]
  }
}
