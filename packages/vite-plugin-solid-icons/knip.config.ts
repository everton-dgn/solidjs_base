import type { KnipConfig } from 'knip'

export default {
  entry: ['src/index.ts!', 'src/types.ts!', 'src/**/__tests__/*.test.ts'],
  project: ['src/**/*.ts!', '!src/**/__tests__/**!'],
  // The tests load hugeicons by its collection name, through @iconify/utils.
  ignoreDependencies: ['@iconify-json/hugeicons'],
  // The catalog sits in the root package.json, which Knip does not read from
  // this folder. bun install already refuses an entry missing from the catalog.
  exclude: ['catalogReferences']
} satisfies KnipConfig
