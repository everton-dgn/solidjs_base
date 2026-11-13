import type { RunTask, SolidAppOptions } from './types.ts'

type Task = Exclude<RunTask, string | string[]>
type TaskCacheConfig = Exclude<Task['cache'], boolean | undefined>
type TaskInput = NonNullable<TaskCacheConfig['input']>[number]
type TaskOptions = Pick<SolidAppOptions, 'workspace'> & {
  isCi: boolean
  hasI18n: boolean
}

const TOOLING_CI_TEST_WORKERS = 3

function fromWorkspace(pattern: string): TaskInput {
  return { pattern, base: 'workspace' }
}

// In a monorepo, bun.lock, bunfig.toml and the build of the shared packages sit
// at the workspace root, outside the application folder.
function installInputs({ workspace }: Pick<TaskOptions, 'workspace'>) {
  const patterns = ['bun.lock', 'bunfig.toml', ...(workspace?.inputs ?? [])]
  return workspace ? patterns.map(pattern => fromWorkspace(pattern)) : patterns
}

export function createTasks({
  workspace,
  isCi,
  hasI18n
}: TaskOptions): Record<string, Task> {
  const install = installInputs({ workspace })
  const lockfile = workspace ? fromWorkspace('bun.lock') : 'bun.lock'
  const dependsOn = workspace ? { dependsOn: workspace.dependsOn } : {}
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
    ...(hasI18n && {
      'i18n-generate': {
        command: 'bun tooling/i18n/generate.ts',
        cache: {
          input: [
            'src/**/i18n/*.json',
            'tooling/i18n/**',
            'project.inlang/settings.json',
            'project.inlang/paraglide.config.ts',
            'package.json',
            lockfile
          ],
          output: ['paraglide/**', '.paraglide/messages/**']
        }
      }
    }),
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
      command:
        'knip-bun --config tooling/knip.ts && knip-bun --config tooling/knip.ts --strict',
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
      dependsOn: ['lint-css'],
      cache: { env: ['NODE_ENV'], input: projectCheckInputs }
    },
    // In a monorepo, vp check uses the lint and fmt blocks of the root; vp fmt
    // and vp lint read the config of the application folder.
    'check-project': {
      command: 'vp fmt --check && vp lint',
      dependsOn: ['lint-css'],
      cache: { env: ['NODE_ENV'], input: projectCheckInputs }
    },
    // The application types come from vp check, with typeCheck in lint.
    // Automatic tracking does not see the reads of the native tsc, so the inputs
    // are explicit: from src, only the extensions tsc reads, because CSS, images
    // and fonts arrive through module declarations. bun.lock stands for the
    // installed types but only keeps the path of the patches, so their content
    // is an input of its own. With noEmit, tsc only writes its .tsbuildinfo to
    // .tsbuild/, its own cache, so nothing has to be restored.
    'typecheck-node': {
      command: 'tsc --project tsconfig.node.json',
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
