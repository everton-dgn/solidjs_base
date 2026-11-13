import path from 'node:path'

import { defineKnipConfig } from '@evertondgn/solid-tooling/knip'

export default defineKnipConfig({
  root: path.resolve(import.meta.dirname, '..'),
  entry: [
    // serverSetup do @solidjs/vite-plugin, carregado pelo caminho configurado
    // no vite.config.ts.
    'src/infra/server/configureServerErrors/index.ts!',
    // API de transporte do boilerplate; o consumidor atual está na fixture E2E.
    'src/infra/server/requestJson/index.ts!',
    // API pública de configuração e métricas; fixtures exercitam os consumidores.
    'src/infra/server/publication/index.ts!',
    // Componentes e APIs públicas reutilizáveis, exercitados pelas fixtures.
    'src/components/atoms/Input/index.tsx!',
    'src/components/atoms/Textarea/index.tsx!',
    'src/components/molecules/Dialog/index.tsx!',
    'src/components/atoms/ToastProvider/useToast/index.ts!',
    'src/primitives/createLocalizedNavigate/index.ts!',
    'src/i18n/localizedRedirect/index.ts!',
    'src/primitives/createOutdatedPageGuard/index.ts!',
    // Cadeia de middleware do build E2E, escolhida por modo no vite.config.ts.
    'src/tests/fixtures/e2e/middleware/index.ts',
    // Scripts das tarefas do vp run. O Knip só lê os comandos de run.tasks
    // escritos no vite.config.ts, e as tarefas vêm do preset.
    'tooling/i18n/generate.ts',
    'tooling/css/check.ts'
  ],
  // O Kingfisher é externo. O vp do script start vem de uma devDependency, que
  // o modo production (ativado pelo --strict) não considera; o '!' restringe o
  // ignore a esse modo, porque na execução padrão ele viraria hint de redundância.
  ignoreBinaries: ['kingfisher', 'vp!'],
  // server-only é um módulo virtual do @solidjs/vite-plugin, sem pacote no npm.
  // Nos testes node, o preset do @evertondgn/solid-tooling o substitui.
  ignoreDependencies: ['server-only'],
  // No monorepo, o catálogo de versões fica no package.json da raiz, que o Knip
  // não lê ao rodar nesta pasta. O bun install já recusa referência a uma
  // entrada que não existe no catálogo.
  exclude: ['catalogReferences']
})
