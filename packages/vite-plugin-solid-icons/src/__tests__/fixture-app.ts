import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'

import solid from '@solidjs/vite-plugin'
import type { InlineConfig } from 'vite-plus'

import { solidIcons } from '../index.ts'

type FixtureFiles = Record<string, string>
type Task = () => unknown
type DeferInput = { context: TestContext; task: Task }
type ConfigInput = {
  root: string
  isSsr: boolean
  typesFile?: string | false
}

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const deferred = new WeakMap<TestContext, Task[]>()

const STAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="red" d="M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z"/></svg>\n'
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>\n'
const MOON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>\n'

const APP = `import Github from 'icon:hugeicons/github'
import githubSvg from 'icon:hugeicons/github?raw'
import Logo from 'icon:own/logo.v2'
import Star from 'icon:own/star'
import { ArrowLeft01 } from 'icon:hugeicons'

import NamedIcons from './NamedIcons.tsx'

export default function App() {
  return (
    <main>
      <Github data-icon="github" />
      <Star data-icon="star" />
      <Logo data-icon="logo" />
      <output id="raw">{githubSvg}</output>
      <NamedIcons />
      <ArrowLeft01 data-icon="arrow" />
    </main>
  )
}
`

const NAMED_ICONS_BODY = `
export default function NamedIcons() {
  return (
    <p>
      <Back data-icon="back" />
      <Icon3dMove data-icon="move" />
      <Moon data-icon="moon" />
    </p>
  )
}
`

const NAMED_ICONS = `import {
  // the arrow of the back button
  ArrowLeft01 as Back,
  type Github as GithubIcon,
  Icon3dMove
} from 'icon:hugeicons'
import { Moon } from 'icon:own'

export type { GithubIcon }
export { ArrowLeft01 } from 'icon:hugeicons'
${NAMED_ICONS_BODY}`

const FILES: FixtureFiles = {
  'index.html':
    '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/entry-client.tsx"></script></body></html>\n',
  'package.json': `${JSON.stringify({
    name: 'icons-app',
    private: true,
    devDependencies: { '@iconify-json/hugeicons': '*' }
  })}\n`,
  // WHY: with verbatimModuleSyntax a type specifier keeps its import, the
  // case the import type of the named imports covers.
  'tsconfig.json': `${JSON.stringify({
    compilerOptions: { verbatimModuleSyntax: true }
  })}\n`,
  'src/App.tsx': APP,
  'src/NamedIcons.tsx': NAMED_ICONS,
  'src/entry-client.tsx': `import { render } from '@solidjs/web'
import App from './App.tsx'

render(() => <App />, document.querySelector('#app')!)
`,
  'src/entry-server.tsx': `import { renderToString } from '@solidjs/web'
import App from './App.tsx'

export const html = () => renderToString(() => <App />)
`,
  'icons/star.svg': STAR_SVG,
  'icons/logo.v2.svg': LOGO_SVG,
  'icons/moon.svg': MOON_SVG
}

// The module of named imports with the imports by path that the plugin
// writes for them.
export const NAMED_ICONS_BY_PATH = `import Back from 'icon:hugeicons/arrow-left-01'
import Icon3dMove from 'icon:hugeicons/3d-move'
import Moon from 'icon:own/moon'

export { default as ArrowLeft01 } from 'icon:hugeicons/arrow-left-01'
${NAMED_ICONS_BODY}`
export const STAR_FILE = 'icons/star.svg'
export const MOON_FILE = 'icons/moon.svg'
export const NAMED_ICONS_FILE = 'src/NamedIcons.tsx'
export const TYPES_FILE = 'src/icon-collections.d.ts'

// Runs the task after the test, before the tasks deferred earlier: a server
// closes before the folder it watches is removed. The hooks of node:test
// run in the order they were added.
export function defer({ context, task }: DeferInput): void {
  const tasks = deferred.get(context) ?? []
  if (tasks.length === 0) {
    deferred.set(context, tasks)
    context.after(async () => {
      for (const cleanup of tasks.toReversed()) await cleanup()
    })
  }
  tasks.push(task)
}

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

export function fixtureConfig({
  root,
  isSsr,
  typesFile
}: ConfigInput): InlineConfig {
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
        ...(typesFile === undefined ? {} : { typesFile }),
        customizeIcon: ({ attributes }) => {
          attributes['aria-hidden'] = 'true'
        }
      }),
      solid({ ssr: isSsr })
    ]
  }
}
