import { defineKnipConfig } from '../solid-tooling/src/knip/index.ts'

// Knip takes the entries from the exports of package.json, the solid condition
// included, so the config lists none.
export default defineKnipConfig({
  root: import.meta.dirname,
  configFile: 'knip.config.ts',
  // A regression test resolves srvx/node through nitro, which installs it.
  // filesystem-routing is an optional peer, which --strict does not accept;
  // the '!' limits that ignore to the production run.
  ignoreDependencies: ['srvx', 'filesystem-routing!'],
  // The catalog sits in the root package.json, which Knip does not read from
  // this folder. bun install already refuses an entry missing from the catalog.
  exclude: ['catalogReferences']
})
