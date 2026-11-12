# @evertondgn/solid-tooling

Lint, formatador e base do TypeScript para aplicações SolidJS construídas com
Vite+. O pacote é distribuído compilado: o Node recusa TypeScript dentro de
`node_modules`, e o Vite+ carrega a configuração em Node.

## Instalação

```bash
vp add -D @evertondgn/solid-tooling
```

A aplicação também declara o `vite-plus` e o `@inlang/paraglide-js`. O Oxlint
resolve os plugins a partir da configuração da aplicação, e o plugin do
Paraglide precisa acompanhar a versão que ela usa. O `eslint-plugin-solid` vem
como dependência do pacote e dispensa declaração.

## Uso

```ts
// vite.config.ts
import { fmt } from '@evertondgn/solid-tooling/fmt'
import { lint } from '@evertondgn/solid-tooling/lint'
import { defineConfig } from 'vite-plus'

export default defineConfig({ fmt, lint })
```

```json
// tsconfig.json
{
  "extends": "@evertondgn/solid-tooling/tsconfig.base.json"
}
```

`paths`, `include` e `types` continuam no `tsconfig.json` da aplicação.

## Entradas

| Entrada                 | Conteúdo                                                    |
| ----------------------- | ----------------------------------------------------------- |
| `./lint`                | Preset de lint, com os plugins abaixo já registrados        |
| `./fmt`                 | Configuração do formatador                                  |
| `./project-plugin`      | Regras de exports, nomes de arquivos de teste e de CSS, SEO |
| `./backend-plugin`      | Imports estáticos das APIs privilegiadas do servidor        |
| `./architecture-plugin` | Dependências entre camadas                                  |
| `./solid-plugin`        | Reexport do `eslint-plugin-solid`                           |
| `./css-filename`        | Regra de nome de arquivo CSS, para o script de lint de CSS  |
| `./tsconfig.base.json`  | Opções do compilador sem caminhos da aplicação              |

O preset pressupõe o layout das aplicações derivadas do `boilerplate_solidjs`:
código em `src/`, ferramentas em `tooling/` e as camadas descritas no guia de
arquitetura da aplicação.
