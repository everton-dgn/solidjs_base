export const LOCALES = ['en', 'pt']
export const SOURCE_PACKAGE = '@scope/source'
export const TASKS = [
  'knip',
  'tsc',
  'playwright',
  'lefthook',
  'commitlint',
  'i18n-generate',
  'lint-css',
  'dead-code-project',
  'lint-project',
  'check-project',
  'typecheck-node',
  'test-tooling'
]
export const WORKSPACE = {
  dependsOn: ['@scope/tooling#build'],
  inputs: ['packages/tooling/dist/**']
}

export const ALL_PUBLICATION_SEO = {
  sitemap: true,
  markdown: { static: true },
  llms: {},
  llmsFull: {}
}
