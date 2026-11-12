# solidjs_base

Pacotes compartilhados pelas aplicações SolidJS construídas com Vite+. Cada
aplicação instala os pacotes como dependência e recebe correções pela
atualização de versão, sem copiar o código para dentro do próprio repositório.

## Pacotes

| Pacote                       | Conteúdo                                                        |
| ---------------------------- | --------------------------------------------------------------- |
| `@devinsights/solid-tooling` | Lint, formatador, regras próprias de lint e base do TypeScript. |

O código de `packages/solid-tooling/src` veio do `tooling/` do
`boilerplate_solidjs`, no commit `31de7bf`.

## Comandos

Instale o CLI global do [Vite+](https://viteplus.dev/guide/). As versões de Node
e Bun ficam no `package.json` da raiz.

| Comando               | Uso                                                              |
| --------------------- | ---------------------------------------------------------------- |
| `vp install`          | Instalar as dependências do workspace                            |
| `vp run build`        | Compilar os pacotes para `dist/`                                 |
| `vp run check`        | Verificar formato, lint e tipos                                  |
| `vp run test`         | Rodar os testes das regras em Node                               |
| `vp run test:tarball` | Instalar o pacote empacotado numa aplicação de teste e validá-lo |
| `vp run validate`     | Executar todos os anteriores em sequência                        |

Os testes das regras que passam pelo CLI carregam os plugins a partir de
`dist/`, por isso `vp run test` compila o pacote antes.

## Uso numa aplicação

```ts
// vite.config.ts
import { fmt } from '@devinsights/solid-tooling/fmt'
import { lint } from '@devinsights/solid-tooling/lint'
import { defineConfig } from 'vite-plus'

export default defineConfig({ fmt, lint })
```

```json
// tsconfig.json
{
  "extends": "@devinsights/solid-tooling/tsconfig.base.json"
}
```

`paths`, `include` e `types` continuam no `tsconfig.json` da aplicação.

A aplicação declara o pacote, o `vite-plus` e o `@inlang/paraglide-js`. O Oxlint
resolve os plugins a partir da configuração da aplicação, e o plugin do
Paraglide precisa acompanhar a versão que ela usa. O `eslint-plugin-solid` vem
como dependência do pacote e dispensa declaração.

O lint de CSS da aplicação importa a regra de nome de arquivo de
`@devinsights/solid-tooling/css-filename`.

O pacote é distribuído compilado: o Node recusa TypeScript dentro de
`node_modules`, e o Vite+ carrega a configuração em Node.
