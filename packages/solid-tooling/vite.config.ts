import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      lint: 'src/lint.ts',
      fmt: 'src/fmt.ts',
      'project-plugin': 'src/project-plugin.ts',
      'backend-plugin': 'src/backendPolicy/plugin.ts',
      'architecture-plugin': 'src/architecturePolicy/index.ts'
    },
    format: ['esm'],
    dts: { generator: 'tsgo' }
  }
})
