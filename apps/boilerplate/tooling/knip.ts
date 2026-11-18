import path from 'node:path'

import { defineKnipConfig } from '@evertondgn/solid-tooling/knip'

export default defineKnipConfig({
  root: path.resolve(import.meta.dirname, '..'),
  entry: [
    // The Vite config serializes these production values into the robots virtual module.
    'src/constants/site/robots.ts!',
    // serverSetup of @solidjs/vite-plugin, loaded through the path configured in
    // vite.config.ts.
    'src/infra/server/configureServerErrors/index.ts!',
    // Transport API of the boilerplate; the current consumer is in the E2E fixture.
    'src/infra/server/requestJson/index.ts!',
    // Public configuration and metrics API; fixtures exercise the consumers.
    'src/infra/server/publication/index.ts!',
    // Reusable public components and APIs, exercised by the fixtures.
    'src/components/atoms/Input/index.tsx!',
    'src/components/atoms/Textarea/index.tsx!',
    'src/components/molecules/Dialog/index.tsx!',
    'src/components/atoms/ToastProvider/useToast/index.ts!',
    'src/primitives/createOutdatedPageGuard/index.ts!',
    // Middleware chain of the E2E build, chosen by mode in vite.config.ts.
    'src/tests/fixtures/e2e/middleware/index.ts',
    // Scripts of the vp run tasks. Knip only reads the run.tasks commands written
    // in vite.config.ts, and the tasks come from the preset.
    'tooling/css/check.ts'
  ],
  // Kingfisher is external. The vp of the start script comes from a
  // devDependency, which production mode (turned on by --strict) does not
  // consider; the '!' limits the ignore to that mode, because in the default run
  // it would become a redundancy hint.
  ignoreBinaries: ['kingfisher', 'vp!'],
  // server-only is virtual. Inlang loads the message-format plugin by its
  // node_modules path in settings.json, outside Knip's import graph.
  // @solidjs/vite-plugin turns on the /__solid/diagnostics endpoint of the dev
  // server when package.json declares @solidjs/diagnostics; only the virtual
  // module of the plugin imports it.
  ignoreDependencies: [
    'server-only',
    '@inlang/plugin-message-format',
    '@solidjs/diagnostics'
  ],
  // In the monorepo, the version catalog lives in the root package.json, which
  // Knip does not read when it runs in this folder. bun install already refuses
  // a reference to an entry missing from the catalog.
  exclude: ['catalogReferences']
})
