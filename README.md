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

## Versionamento e publicação

Cada pacote tem a própria versão, no `package.json` dele, e é publicado de forma
independente no npm público, no escopo `@everton-dgn`. A raiz do workspace é
privada e não tem versão publicável.

O [release-please](https://github.com/googleapis/release-please) cuida das
versões a partir dos Conventional Commits. Ele roda só no CI, pelo workflow
`.github/workflows/release.yml`, e não entra nas dependências do projeto.

1. Um commit na `main` que altera arquivos de um pacote entra na próxima versão
   dele. O pacote é identificado pela pasta dos arquivos alterados; o escopo do
   commit (`feat(tooling): ...`) serve à leitura do histórico.
2. O workflow mantém aberto um PR de release por pacote, com a versão nova e o
   `CHANGELOG.md` do pacote.
3. O merge desse PR cria a tag, no formato `solid-tooling@0.2.0`, e a GitHub
   Release. Em seguida o workflow valida o workspace e publica o pacote.

| Commit                                             | Incremento com versão abaixo de 1.0.0 |
| -------------------------------------------------- | ------------------------------------- |
| `fix`                                              | Patch                                 |
| `feat`                                             | Minor                                 |
| `!` no cabeçalho ou `BREAKING CHANGE:` no rodapé   | Minor                                 |
| Outros tipos (`chore`, `docs`, `test`, `refactor`) | Não geram release sozinhos            |

A partir da 1.0.0, uma mudança incompatível passa a subir a major.

### Arquivos de configuração

- `release-please-config.json` lista os pacotes e as regras. Um pacote novo
  entra em `packages`, pelo caminho da pasta.
- `.release-please-manifest.json` guarda a última versão publicada de cada
  pacote. O release-please o atualiza; a edição manual só cabe ao incluir um
  pacote que já tem versão publicada.

### Configuração do repositório no GitHub

O workflow depende de duas configurações feitas uma vez:

- o segredo `NPM_TOKEN`, com um token do npm que possa publicar no escopo;
- a opção "Allow GitHub Actions to create and approve pull requests", em
  Settings > Actions > General.

### Limite conhecido

O `bun.lock` registra a versão de cada pacote do workspace, e o release-please
não o atualiza. Depois de um release, a linha fica uma versão atrás até o
próximo `vp install`, que a corrige. A instalação com lockfile congelado do CI
não falha por isso.

### Publicação manual

Para publicar fora do workflow, a partir de uma árvore limpa:

```bash
vp pm login
vp run validate
vp -C packages/solid-tooling pm publish --dry-run
vp -C packages/solid-tooling pm publish
```

`prepublishOnly` compila o pacote antes do envio.
