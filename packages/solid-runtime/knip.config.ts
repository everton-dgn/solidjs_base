import { defineKnipConfig } from '../solid-tooling/src/knip/index.ts'

// Knip takes the entries from the exports of package.json, the solid condition
// included, so the config lists none.
export default defineKnipConfig({
  root: import.meta.dirname,
  configFile: 'knip.config.ts',
  // A regression test resolves srvx/node through nitro, which installs it.
  // filesystem-routing is an optional peer, which --strict does not accept;
  // the '!' limits that ignore to the production run.
  // solid-js remains supplied by the application; theme extraction preserves
  // dependency ownership. Installed scenarios verify both Bun linkers.
  // server-only is a Solid plugin boundary module, not an installed package.
  // The runtime node tests provide the same stand-in as the application preset.
  ignoreDependencies: [
    'srvx',
    'filesystem-routing!',
    'solid-js!',
    'server-only'
  ],
  // The catalog sits in the root package.json, which Knip does not read from
  // this folder. bun install already refuses an entry missing from the catalog.
  exclude: ['catalogReferences']
})
