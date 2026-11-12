import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    tasks: {
      // Os testes criam fixtures em diretórios temporários que o cache não
      // rastreia; cada execução precisa rodar de verdade.
      'test-rules': {
        command:
          "node --test --test-timeout=60000 'src/__tests__/*.test.ts' 'src/!(tarball)/**/__tests__/*.test.ts'",
        dependsOn: ['build'],
        cache: false
      },
      'test-tarball': {
        command:
          'node --test --test-timeout=300000 src/tarball/__tests__/consumer.test.ts',
        dependsOn: ['build'],
        cache: false
      }
    }
  },
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
