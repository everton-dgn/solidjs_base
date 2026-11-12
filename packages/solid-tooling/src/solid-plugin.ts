// WHY: o Oxlint resolve jsPlugins a partir da configuração da aplicação, e o
// linker isolado do Bun só expõe ali as dependências diretas dela. Este módulo
// resolve o plugin a partir do pacote, que o declara como dependência.
export { default } from 'eslint-plugin-solid'
