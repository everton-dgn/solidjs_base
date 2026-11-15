import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    tasks: {
      // The tests build applications in temporary directories that the cache
      // does not track; every run has to execute for real.
      'test-plugin': {
        command:
          "node --test --test-concurrency=1 --test-timeout=180000 'src/__tests__/*.test.ts' 'src/!(tarball)/**/__tests__/*.test.ts'",
        cache: false
      },
      'test-tarball': {
        command:
          'node --test --test-timeout=120000 src/tarball/__tests__/tarball.test.ts',
        dependsOn: ['build'],
        cache: false
      }
    }
  },
  pack: {
    // The types entry lets the declarations of an application import the
    // component type without the types of Vite.
    entry: { index: 'src/index.ts', types: 'src/types.ts' },
    format: ['esm'],
    dts: { generator: 'tsgo' },
    exports: {
      customExports: exports => ({
        ...exports,
        './icon-modules': { types: './icon-modules.d.ts' }
      })
    }
  }
})
