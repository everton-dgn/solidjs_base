import { defineKnipConfig } from '../solid-tooling/src/knip/index.ts'

// Knip takes the entries from the exports of package.json, the solid condition
// included, so the config lists none.
export default defineKnipConfig({
  root: import.meta.dirname,
  configFile: 'knip.config.ts',
  // This package defines its own test config and owns the test dependencies.
  packagedTestTools: false,
  // A regression test resolves srvx/node through nitro, which installs it.
  // The published middleware types require the Solid plugin; --strict skips
  // type-only imports, so the ignore applies only to that production run.
  // solid-js and the router remain supplied by the application; extraction preserves
  // dependency ownership. Installed scenarios verify both Bun linkers.
  // server-only is a Solid plugin boundary module, not an installed package.
  // The runtime node tests provide the same stand-in as the application preset.
  ignoreDependencies: [
    'srvx',
    '@solidjs/vite-plugin!',
    'solid-js!',
    '@solidjs/router!',
    'server-only'
  ],
  // The catalog sits in the root package.json, which Knip does not read from
  // this folder. bun install already refuses an entry missing from the catalog.
  exclude: ['catalogReferences']
})
