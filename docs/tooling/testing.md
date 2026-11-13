# Testing

[Tooling reference](README.md)

`solidTest` returns the `test` block of `vite.config.ts`, with three Vitest
projects:

| Project   | Files                            | Environment                                      |
| --------- | -------------------------------- | ------------------------------------------------ |
| `node`    | `src/**/*.node.test.{ts,tsx}`    | Node, with stand-ins for the build-only modules  |
| `dom`     | `src/**/*.dom.test.{ts,tsx}`     | happy-dom at `http://localhost/en`               |
| `browser` | `src/**/*.browser.test.{ts,tsx}` | Chromium through Playwright, with the CSS loaded |

`defineSolidApp` from `./vite` already calls `solidTest`. An application that
builds its own Vite config calls it directly:

```ts
// vite.config.ts
import { solidTest } from '@evertondgn/solid-tooling/vitest'
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: solidTest({
    root: import.meta.dirname,
    plugins: () => [solid({ serverFunctions: true })]
  })
})
```

`plugins` is a function that returns the Vite plugins the `dom` and `browser`
projects need to compile components: Solid, routes, icons and i18n. The preset
calls it once per project, because each project starts its own Vite server and a
plugin instance keeps the state of one server. The preset also sets the coverage
thresholds, the reporters and the workers on CI, passes `BASE_URL_TEST`, `HOST`
and `PORT` to the tests when they are set, and resets the Paraglide locale
before each browser test.

The `node` project does not load the Solid and routing plugins, so a plugin of
the preset serves `server-only`, `virtual:file-routes` and
`virtual:solid-server-function-handler`. Knip does not know `server-only`, a
virtual module of `@solidjs/vite-plugin`: pass it in the `ignoreDependencies` of
[`defineKnipConfig`](knip-and-css.md#knip).

A package that ships TypeScript source under the `solid` export condition, such
as `@evertondgn/solid-runtime`, only resolves where that condition is set. The
Solid plugin sets it; the `node` project does not load the plugin, and the
condition cannot go to the whole project, because the router would then resolve
to its `.jsx` source. A plugin of the preset applies the condition only to the
packages in `sourcePackages`, which is `['@evertondgn/solid-runtime']` by
default. A listed package that is not installed changes nothing.

`definePlaywrightConfig` builds the Playwright config from the application root:

```ts
// playwright.config.ts
import { definePlaywrightConfig } from '@evertondgn/solid-tooling/playwright'

export default definePlaywrightConfig({ root: import.meta.dirname })
```

It reads `BASE_URL_TEST` from `.env.test`, builds the application (`e2e` mode
for the fixture routes, `production` with `TEST_PRODUCTION_ROUTES=true`), starts
the preview, and checks the server log for private markers when the suite ends.
`TEST_PREBUILT=true` reuses an existing production build.

| Option           | Default           | Use                                                                    |
| ---------------- | ----------------- | ---------------------------------------------------------------------- |
| `testDir`        | `src/tests/pages` | Folder of the `*.e2e.test.ts` files                                    |
| `fixtureServers` | none              | Extra servers for the fixture routes, as `{ command, url }`            |
| `suites`         | none              | Globs of serial suites: `serverLogs`, `markdown` and `publicationLoad` |

Each serial suite gets its own project: `markdown` runs with one worker,
`serverLogs` runs last as the teardown of the others, and `publicationLoad` runs
alone, against two servers, with `TEST_PUBLICATION_LOAD=true`.
