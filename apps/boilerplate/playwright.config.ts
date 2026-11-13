import { definePlaywrightConfig } from '@evertondgn/solid-tooling/playwright'

export default definePlaywrightConfig({
  root: import.meta.dirname,
  // Backend simulado das fixtures de erro, usado só pelas rotas E2E.
  fixtureServers: [
    {
      command: 'bun tooling/testing/error-backend.ts',
      url: 'http://127.0.0.1:4318/control'
    }
  ],
  suites: {
    serverLogs: '**/OutsideError.e2e.test.ts',
    markdown: '**/Markdown/*.e2e.test.ts',
    publicationLoad: '**/PublicationLoad.e2e.test.ts'
  }
})
