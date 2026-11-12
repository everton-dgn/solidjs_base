# Aplicação de teste

Esta pasta é copiada para um diretório temporário pelo teste
`packages/solid-tooling/src/tarball/__tests__/consumer.test.ts`, que instala o
pacote empacotado e roda o lint. Os arquivos de `src/` trazem violações
deliberadas: uma por plugin próprio, uma do plugin do Solid e uma de tipo.
`clean.ts` e `vite.config.ts` são os controles sem diagnósticos.

A fixture declara só o que uma aplicação teria de declarar. Com o linker isolado
do Bun, uma dependência a menos aqui revela o que o pacote deixou de resolver
sozinho.
