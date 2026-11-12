import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      lint: 'src/lint.ts',
      fmt: 'src/fmt.ts',
      'project-plugin': 'src/project-plugin.ts',
      'backend-plugin': 'src/backendPolicy/plugin.ts',
      'architecture-plugin': 'src/architecturePolicy/index.ts',
      'css-filename': 'src/css/css-filename.ts',
      'solid-plugin': 'src/solid-plugin.ts'
    },
    format: ['esm'],
    dts: { generator: 'tsgo' },
    exports: {
      customExports: exports => ({
        ...exports,
        './tsconfig.base.json': './tsconfig.base.json'
      })
    }
  }
})
