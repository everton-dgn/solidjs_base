import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ICON_TYPES_FILE } from '../icons/constants.ts'
import type { RunTask, SolidAppOptions } from './types.ts'

type Task = Exclude<RunTask, string | string[]>
type TaskCacheConfig = Exclude<Task['cache'], boolean | undefined>
type TaskInput = NonNullable<TaskCacheConfig['input']>[number]
type TaskOptions = Pick<SolidAppOptions, 'workspace' | 'root' | 'icons'> & {
  isCi: boolean
  hasI18n: boolean
}
type IconFolders = Pick<SolidAppOptions, 'root' | 'icons'>

const TOOLING_CI_TEST_WORKERS = 3
const TOOL_NAMES = ['knip', 'tsrs', 'playwright', 'lefthook', 'commitlint']
// A folder whose path has one of them would match other files as a pattern.
const GLOB_CHARACTERS = /[*?[\]{}()!\\]/u

function quote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`
}

function toolCommand(name: string): string {
  const cli = fileURLToPath(new URL('cli.mjs', import.meta.url))
  return `node '${cli.replaceAll("'", String.raw`'\''`)}' ${name}`
}

function fromWorkspace(pattern: string): TaskInput {
  return { pattern, base: 'workspace' }
}

// The SVG files of each folder collection, so a new file changes the
// declarations; the automatic tracking covers the reads. WHY: a pattern of the
// cache is relative to the application, so a folder outside it, or one that a
// pattern cannot spell, returns undefined and the task runs without a cache
// instead of restoring the declarations of an older listing.
function iconFolderInputs({ root, icons }: IconFolders): string[] | undefined {
  const inputs: string[] = []
  for (const folder of Object.values(icons ?? {})) {
    const relative = path
      .relative(root, path.resolve(root, folder))
      .split(path.sep)
      .join('/')
    if (
      relative === '..' ||
      relative.startsWith('../') ||
      path.isAbsolute(relative) ||
      GLOB_CHARACTERS.test(relative)
    ) {
      return undefined
    }
    inputs.push(relative === '' ? '*.svg' : `${relative}/*.svg`)
  }
  return inputs
}

// In a monorepo, bun.lock, bunfig.toml and the build of the shared packages sit
// at the workspace root, outside the application folder.
function installInputs({ workspace }: Pick<TaskOptions, 'workspace'>) {
  const patterns = ['bun.lock', 'bunfig.toml', ...(workspace?.inputs ?? [])]
  return workspace ? patterns.map(pattern => fromWorkspace(pattern)) : patterns
}

export function createTasks({
  workspace,
  root,
  icons,
  isCi,
  hasI18n
}: TaskOptions): Record<string, Task> {
  const install = installInputs({ workspace })
  const dependsOn = workspace ? { dependsOn: workspace.dependsOn } : {}
  const iconInputs = iconFolderInputs({ root, icons })
  // lint-project and check-project depend on lint-css, which handles the CSS.
  // The explicit inputs cover the declarations that lint and the formatter
  // ignore, the TypeScript configs and the installed dependencies.
  const projectCheckInputs: TaskInput[] = [
    { auto: true },
    'src/**',
    'paraglide/**',
    'tooling/**',
    '*.ts',
    'tsconfig*.json',
    'package.json',
    'patches/**',
    ...install
  ]
  const testConcurrency = isCi
    ? ` --test-concurrency=${TOOLING_CI_TEST_WORKERS}`
    : ''

  return {
    ...Object.fromEntries(
      TOOL_NAMES.map(name => [
        name,
        { command: toolCommand(name), cache: false }
      ])
    ),
    ...(hasI18n && {
      'i18n-generate': {
        command: `bun '${fileURLToPath(new URL('i18n-generate.mjs', import.meta.url)).replaceAll("'", String.raw`'\''`)}'`,
        ...dependsOn,
        cache: {
          input: [
            { auto: true },
            'src/**/i18n/*.json',
            'project.inlang/settings.json',
            'project.inlang/paraglide.config.ts',
            'package.json',
            ...install
          ],
          output: ['paraglide/**', '.paraglide/messages/**']
        }
      }
    }),
    // Writes the declarations of the icon names that the plugin writes in the
    // dev server and the build, for the type check that runs before them.
    'icons-generate': {
      command: `node ${quote(fileURLToPath(new URL('icons-generate.mjs', import.meta.url)))} ${quote(JSON.stringify({ root, collections: icons ?? {} }))}`,
      ...dependsOn,
      cache:
        iconInputs === undefined
          ? false
          : {
              input: [
                { auto: true },
                ...iconInputs,
                'package.json',
                ...install
              ],
              output: [ICON_TYPES_FILE]
            }
    },
    // The explicit inputs keep the cache of the CSS lint independent of how
    // each operating system tracks the reads of the runtime.
    'lint-css': {
      command: 'bun tooling/css/check.ts',
      ...dependsOn,
      cache: {
        env: ['NODE_ENV'],
        input: [
          { auto: true },
          'src/**/*.css',
          'tooling/css/**',
          'package.json',
          ...install
        ]
      }
    },
    // The Knip plugins read the configs at the root and, as in the CSS lint,
    // the automatic tracking of Bun reads varies by operating system.
    'dead-code-project': {
      command: `${toolCommand('knip')} --config tooling/knip.ts && ${toolCommand('knip')} --config tooling/knip.ts --strict`,
      ...dependsOn,
      cache: {
        env: ['NODE_ENV'],
        input: [
          { auto: true },
          'src/**',
          'paraglide/**',
          'tooling/**',
          '*.ts',
          'tsconfig*.json',
          'package.json',
          ...install
        ],
        output: []
      }
    },
    'lint-project': {
      command: 'vp lint',
      dependsOn: ['lint-css', 'icons-generate'],
      cache: { env: ['NODE_ENV'], input: projectCheckInputs }
    },
    // In a monorepo, vp check uses the lint and fmt blocks of the root; vp fmt
    // and vp lint read the config of the application folder.
    'check-project': {
      command: 'vp fmt --check && vp lint',
      dependsOn: ['lint-css', 'icons-generate'],
      cache: { env: ['NODE_ENV'], input: projectCheckInputs }
    },
    // The application types come from vp check, with typeCheck in lint.
    // The inputs are explicit because the automatic tracking of the tsrs reads
    // was only checked on macOS: from src, only the extensions tsrs reads,
    // because CSS, images and fonts arrive through module declarations. bun.lock
    // stands for the installed types but only keeps the path of the patches, so
    // their content is an input of its own. With noEmit, tsrs only writes its
    // .tsbuildinfo to .tsbuild/, its own cache, so nothing has to be restored.
    'typecheck-node': {
      command: `${toolCommand('tsrs')} --project tsconfig.node.json`,
      ...dependsOn,
      cache: {
        input: [
          'tsconfig.json',
          'tsconfig.node.json',
          'vite.config.ts',
          'playwright.config.ts',
          'tooling/**/*.ts',
          // tooling imports modules from src, and the tsconfig includes the
          // Paraglide config, which imports settings.json.
          'src/**/*.ts',
          'src/**/*.tsx',
          'src/**/*.json',
          'project.inlang/paraglide.config.ts',
          'project.inlang/settings.json',
          'package.json',
          'patches/**',
          ...install
        ],
        output: []
      }
    },
    // The tests create repositories and fixtures in temporary folders that the
    // cache does not track; every run has to execute for real.
    'test-tooling': {
      command: `node --test${testConcurrency} --test-timeout=60000 'tooling/__tests__/*.test.ts' 'tooling/!(release)/**/__tests__/*.test.ts'`,
      cache: false
    }
  }
}
