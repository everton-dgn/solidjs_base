# solidjs_base

Pacotes compartilhados pelas aplicações SolidJS construídas com Vite+. Cada
aplicação instala os pacotes como dependência e recebe correções pela
atualização de versão, sem copiar o código para dentro do próprio repositório.

## Pacotes

| Pacote                       | Conteúdo                                                        |
| ---------------------------- | --------------------------------------------------------------- |
| `@everton-dgn/solid-tooling` | Lint, formatador, regras próprias de lint e base do TypeScript. |

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

Instalação, configuração e entradas estão no
[README do pacote](packages/solid-tooling/README.md).

## Publicação

Os pacotes vão para o npm público, no escopo `@everton-dgn`. A publicação é
manual e parte de uma árvore limpa:

```bash
vp run validate
cd packages/solid-tooling
bun publish --dry-run
bun publish
```

`prepublishOnly` compila o pacote antes do envio. Suba a versão no
`package.json` do pacote antes de publicar; o npm recusa repetir uma versão.
