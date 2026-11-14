import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    tasks: {
      // The tests create fixtures in temporary directories that the cache does
      // not track; every run has to execute for real.
      'test-rules': {
        command:
          "node --test --test-timeout=60000 'src/__tests__/*.test.ts' 'src/!(tarball)/**/__tests__/*.test.ts'",
        dependsOn: ['build'],
        cache: false
      },
      'test-tarball': {
        command:
          'node --test --test-timeout=300000 src/tarball/__tests__/tarball.test.ts',
        dependsOn: ['build'],
        cache: false
      }
    }
  },
  pack: {
    entry: {
      lint: 'src/lint.ts',
      fmt: 'src/fmt.ts',
      commitlint: 'src/commitlint/index.ts',
      'project-plugin': 'src/project-plugin.ts',
      'backend-plugin': 'src/backendPolicy/plugin.ts',
      'architecture-plugin': 'src/architecturePolicy/index.ts',
      'css-filename': 'src/css/css-filename.ts',
      knip: 'src/knip/index.ts',
      stylelint: 'src/stylelint/index.ts',
      'solid-plugin': 'src/solid-plugin.ts',
      vite: 'src/vite/index.ts',
      'i18n-generate': 'src/i18n/generate.ts',
      vitest: 'src/vitest/index.ts',
      'vitest-setup/browser': 'src/vitest/setup/browser.ts',
      playwright: 'src/playwright/index.ts',
      'playwright-teardown': 'src/playwright/teardown.ts'
    },
    format: ['esm'],
    dts: { generator: 'tsgo' },
    // The application generates its Paraglide modules; the browser setup
    // imports them at test time, through the alias of the vitest preset.
    deps: { neverBundle: [/^@paraglide\//u] },
    exports: {
      customExports: exports => ({
        ...exports,
        './tsconfig.base.json': './tsconfig.base.json',
        './tsconfig.app.json': './tsconfig.app.json',
        './virtual-modules': { types: './virtual-modules.d.ts' },
        './lefthook.yml': './lefthook.yml'
      })
    }
  }
})
