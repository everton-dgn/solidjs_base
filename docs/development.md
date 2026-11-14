# Development

## Setup

Install the global [Vite+](https://viteplus.dev/guide/) CLI (`vp`). The root
`package.json` sets the Bun version (`packageManager`) and the Node version
(`devEngines`), and `vp` uses them.

```bash
vp install
vp run build
```

`vp run build` compiles `@evertondgn/solid-tooling` to `dist/`. The application
in `apps/boilerplate` imports the package from there, so build it before running
anything in the application.

## Workspace

The root `package.json` lists two workspace folders:

- `packages/*`: the packages published to npm. `@evertondgn/solid-runtime` stays
  private until its first publish.
- `apps/*`: applications that use the packages through the workspace. They are
  never published.

`fixtures/consumer` and `fixtures/apps/` are outside the workspace on purpose.
The tarball test copies the consumer to a temporary folder and installs the
packed package there, the way an application installs it from npm. The
[installed application scenarios](#installed-application-scenarios) do the same
with the minimal applications of `fixtures/apps/`.

The tooling package owns its build, test, type-check and hook dependencies.
Applications declare only their own imports and the Vite+ installation. The
runtime owns the routing helpers it imports and re-exports `StartMiddleware`
from `./middleware/types`. The copy keeps Nitro, routing and Playwright Test
because its own code imports them. See
[requirements](tooling/limits.md#requirements) and
[ADR 0027](ADRs/0027-packaged-tool-dependencies.md).

Bun's default trust list runs Lefthook's postinstall even as a transitive
dependency. Root and fixture manifests set `trustedDependencies: []`; installing
dependencies does not install hooks. Consumers opt in with the packaged
`lefthook install` command after creating their hook config. The copy continues
to have no repository hooks.

Bun reads `catalog`, `overrides` and `patchedDependencies` only from the root
`package.json`. The versions and patches that `apps/boilerplate` needs are kept
there, and the patch files stay in `apps/boilerplate/patches/`.

## Package commands

Run them from the root. Package commands select `./packages/*`. The publish job
runs `vp run validate`, including the minimal installed application matrix. The
full boilerplate application suites remain separate.

| Command                 | What it does                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `vp run build`          | Compile the packages to `dist/`                                                                |
| `vp run check`          | Check format, lint and types at the root, then lint the runtime package in its folder          |
| `vp run dead-code`      | Find unused files, exports and dependencies of the runtime package with Knip                   |
| `vp run test`           | Run the rule tests with `node:test` and the runtime tests                                      |
| `vp run test:tarball`   | Pack each package and install it in a temporary folder                                         |
| `vp run test:scenarios` | Install and build three minimal applications with both Bun linkers                             |
| `vp run validate`       | Build, check, dead code, package tests, tarball tests and application scenarios, in this order |

The rule tests that go through the Oxlint CLI load the plugins from `dist/`, so
`vp run test` builds the package first. The runtime tests run in the Vitest of
`packages/solid-runtime` (`vp test run --coverage` in that folder), with the
stand-ins and the coverage thresholds that `solidTest` gives to an application.
The runtime package has no build, so the filtered `build` skips it, and the
tooling package has no `check` or `dead-code` script, so those skip it.

The root `vite.config.ts` lints the tooling sources with the same preset,
loading the plugins from `src/` instead of `dist/`, so a change to a rule is
checked on the next run without a build. The tooling sources get the overrides
the preset writes for an application's `tooling/` folder.

The runtime package runs its own checks
([ADR 0020](ADRs/0020-runtime-package-checks-in-its-own-folder.md)). Its `check`
script runs `vp lint` in `packages/solid-runtime`, whose `vite.config.ts` loads
the same preset from the sources. From that folder its `src/` is the `src/` of
an application, so the backend policy, the test exceptions, the architecture
rule and the other rules that read paths apply as they do in an application, and
the type check reads `packages/solid-runtime/tsconfig.json`. The root lint
ignores the package, so each file is linted once. The script is not `vp check`,
which in a workspace package uses the `lint` and `fmt` blocks of the root. The
formatter stays at the root, which covers the package. The `dead-code` script
runs Knip in the default and `--strict` modes; Knip reads the entries from the
`exports` of the package. The tarball test packs the package, extracts it to the
`node_modules` of a temporary folder and checks that the header constants load
in Node, that every target of `exports` is in the tarball and that no
`__tests__` folder is published.

## The boilerplate app

`apps/boilerplate` is a copy of boilerplate_solidjs, taken at commit `6145493`.
It uses `@evertondgn/solid-tooling` from the workspace in place of its own lint
rules, formatter settings and TypeScript base, and runs the full suites of the
original. A change to a package that breaks the application fails here, before
it becomes a version. [ADR 0009](ADRs/0009-boilerplate-app-in-the-monorepo.md)
explains why the copy exists.

Run its commands from `apps/boilerplate`:

| Command                      | What it does                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `vp run check:ci`            | Format check, lint with type checking, and the CSS lint                         |
| `vp run typecheck:node`      | Type check `vite.config.ts` and `tooling/`                                      |
| `vp run dead-code`           | Find unused files, exports and dependencies with Knip                           |
| `vp run test:ci`             | Vitest with coverage: node, dom and browser projects                            |
| `vp run test:tooling`        | Tests of application CSS Module class names and patched dependency registration |
| `vp run build`               | Build the application                                                           |
| `vp run test:e2e`            | Playwright end-to-end tests                                                     |
| `vp run test:e2e:production` | Production routes and server-log teardown                                       |

Every command loads the application's `vite.config.ts`, which imports the
compiled presets from `dist/` and the security header constants from
`@evertondgn/solid-runtime`. Run `vp run build` at the root first, and again
after changing the package. Once `dist/` exists, `check:ci`, `typecheck:node`
and `dead-code` rebuild the package before they run.

In a Vite+ monorepo, `vp check` always uses the `lint` and `fmt` blocks of the
root `vite.config.ts`. The root config ignores `apps/`, and the application runs
`vp fmt --check` and `vp lint`, which read the config of the folder they run in.

### What changed from the original

- `env.ts` spreads `serverEnv` from `@evertondgn/solid-runtime/env` for the
  optional preset variables. The SEO option validates `VITE_SITE_URL`;
  `SITE.url` reads the runtime origin entry. The copy retains Valibot for its
  remaining imports and `ImportMetaEnv` for `PUBLICATION_BUILD_ID`. The runtime
  supplies the schema and its Valibot dependency; the tooling stays in
  `devDependencies`. No dependency version changes.
- Left out: the rules that moved to the package, the release automation
  (`tooling/release/`), the CI reuse proof (`tooling/ciReuse/`), `.github/`, Git
  hooks, commitlint and the project changelog.
- `vite.config.ts`, `tsconfig.json` and `tooling/css/check.ts` import from the
  package. The lint fixture helper lives in the package with its consumers.
- The Vitest projects, the Playwright config (`playwright.config.ts`, in place
  of `tooling/playwright.ts`), the browser test setup, the test stand-ins of
  `tooling/testing/` and the server log teardown come from the package, with
  their tests. `tsconfig.json` extends `tsconfig.app.json` and keeps only the
  `paths`.
- `vite.config.ts` calls `defineSolidApp` from `./vite`: the plugins, the
  headers of the static files, the build, CSS, server and preview blocks and the
  `vp run` tasks come from the package. Independent `seo` options enable
  publication headers and the compiled artifact pipeline, with one build id. The
  `workspace` option points `bun.lock`, `bunfig.toml` and the package build to
  the monorepo root; a copy outside the workspace leaves it out.
- `tooling/knip.ts` and `tooling/css/check.ts` call `defineKnipConfig` and
  `checkCss` from the package and pass only what is the application's own: the
  public API entries, the fixture middleware and the ignores below. The
  Stylelint config, the CSS policy tests and the `stylelint` and
  `stylelint-use-nesting` dependencies moved to the package, and the CSS lint
  messages are in English.
- `tooling/i18n/` and its 36 tests moved to `packages/solid-tooling/src/i18n/`.
  The preset enables the packaged plugin from `project.inlang/settings.json` and
  runs its compiled generator. Catalogs and compiler settings remain in the
  copy; `@inlang/sdk` leaves its manifest, while `valibot` remains used by
  `src/`.
- `tooling/knip.ts` lists `tooling/css/check.ts` as an entry. Knip reads task
  commands only from a `run.tasks` block written in `vite.config.ts`, and the
  tasks now come from the package.
- `tooling/knip.ts` lists `server-only` in `ignoreDependencies`: the original
  resolved it through a test alias to `tooling/testing/server-only.ts`.
- It also ignores `@inlang/plugin-message-format`, which Inlang loads by the
  node_modules path in settings.json, outside Knip's import graph.
- `tooling/__tests__/patched-dependencies.test.ts` reads the root `package.json`
  and `bun.lock`.
- The middleware steps `securityHeaders` (with its constants),
  `restrictPageMethods`, `requestClassification`, `negotiatePageFormat` and
  `isHtmlResponse`, and the `Middleware` and `Next` types, moved to
  `@evertondgn/solid-runtime` with their tests, and `apiRoutes` from the package
  replaces the `createAPIHandler(routes)` call of `src/middleware/index.ts`. The
  locale, Markdown and failure steps now use runtime factories, while the
  application keeps bindings in `src/middleware/`
  ([ADR 0018](ADRs/0018-runtime-package-middleware.md)).
- `src/middleware/securityHeaders/constants.ts` holds the header values and the
  CSP directives of the copy, spread from the package defaults, and
  `src/middleware/securityHeaders/index.ts` holds the only
  `createSecurityHeaders` call. The chain, the failure containment, the locale
  step, the uncached Markdown responses and `vite.config.ts` read from that
  folder; `requestNonce` comes from the package
  ([ADR 0019](ADRs/0019-runtime-security-headers-options.md)).
- `src/constants/http.ts` lost `HTTP_METHOD_NOT_ALLOWED`, used only by
  `restrictPageMethods`, and `tooling/knip.ts` lost the ignore of the moved
  `securityHeaders` test. The `workspace` option of `vite.config.ts` lists
  `packages/solid-runtime/src/**` and the package manifest, whose `exports`
  resolve each import, as inputs of the cached tasks. Without them, only the
  lint noticed a change in the package, through the automatic tracking; the Node
  type check replayed its cached result after a change in the header types that
  `vite.config.ts` reads.
- `tooling/knip.ts` excludes the `catalogReferences` check: Knip runs in the
  application folder and does not see the root catalog. `bun install` already
  fails on a catalog entry that does not exist.
- `docs/` and `AGENTS.md` point the rule paths to `packages/solid-tooling/src/`
  and the moved middleware files to `packages/solid-runtime/src/`, and are in
  English ([ADR 0014](ADRs/0014-boilerplate-copy-docs-in-english.md)). Their
  sections about releases, CI, Git hooks and the Vercel deploy describe the
  original repository.

- `src/i18n/urls`, `src/i18n/buildLocaleAlternates` and
  `src/middleware/helpers/appendVary` moved with their tests to the runtime.
  Consumers use package specifiers. Request locale handling, persistence and
  localized redirects also moved with their tests in ADR 0023. ADR 0026 moves
  navigation, its guards and all 10 navigation cases into the runtime, including
  real-browser history tests. `localeTag` canonicalizes tags with optional
  application overrides; the copy keeps `LOCALE_TAG_OVERRIDES`, LocalizedLink
  and messages. The unused redirect constant and the old Knip entry were removed
  with their consumers.

### Updating the copy

The copy does not follow boilerplate_solidjs on its own. To bring it up to date,
take the new commit of the original, apply it over `apps/boilerplate` and keep
the changes listed above. The guides of the original are in Portuguese:
translate the parts the new commit changes, and keep the headings in step with
the links that point to them. Then run the commands of the table and record the
new commit in this guide, in `apps/boilerplate/README.md`, in
`apps/boilerplate/AGENTS.md` and in the links of the guides that point to files
of the original at the copied commit.

## README figures

The figures of the two READMEs are the `.webp` files in `docs/assets/readme/`,
one per theme. Their source is `docs/assets/readme/figures.html`, a page with
the six figures drawn in HTML and CSS from the real code, numbers and command
output. Open it with `?figure=<id>&theme=<dark|light>` to see one figure, where
`<id>` is the `id` of its section, or without parameters to see them all.

To export a figure, take a screenshot of its section in a headless browser with
an 800 px wide viewport, a device scale factor of 2 and a transparent
background, and convert it to WebP. The fonts load from Google Fonts, so the
export needs network access.

The figures repeat numbers that the READMEs state as text, such as the line
counts of the before and after table. When one of those numbers changes, change
it in `figures.html` too and export the figure again.

## CI

`.github/workflows/ci.yml` runs on pull requests, on pushes to `main` and by
hand. The `Changes` job reads the list of changed files and starts only the jobs
those files affect. A push to `main` that merges an up-to-date pull request with
a passed `CI required` starts no job, because the pull request run checked the
same tree ([ADR 0017](ADRs/0017-main-reuses-the-pull-request-run.md)). Manual
runs start every job.

| Changed files                                                            | Jobs                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------- |
| Only Markdown, `docs/`, `LICENSE`, issue templates or `.coderabbit.yaml` | Docs                                           |
| Only `apps/boilerplate/`                                                 | Boilerplate app, Boilerplate app E2E           |
| Anything else: packages, fixtures, root config, lockfile, workflows      | Packages, Boilerplate app, Boilerplate app E2E |

A pull request that touches more than one group runs the jobs of each.

| Job                 | What it runs                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Docs                | `vp fmt --check`, and an offline link check (lychee) over the Markdown of the repository, anchors included |
| Packages            | `vp run validate`, the same command as the publish job                                                     |
| Boilerplate app     | `vp run build` at the root, then check, Node type check, dead code, tests with coverage and tooling tests  |
| Boilerplate app E2E | `vp run build` at the root, then the application build and the end-to-end tests                            |
| CI required         | Fails when any job above failed or was cancelled                                                           |

`CI required` is the only check the `main` ruleset requires. A job skipped by
its `if`
[reports success](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions),
so a skipped job never blocks a merge, and a new job only needs to be added to
the `needs` of `CI required`.
[ADR 0010](ADRs/0010-ci-runs-what-a-change-affects.md) explains the choices.

The browser and end-to-end tests use the Chrome installed on the GitHub runner,
as in the original repository.

CodeRabbit reviews at most 100 files per pull request. `.coderabbit.yaml` leaves
out the files of `apps/boilerplate` copied unchanged from the original, so an
update of the copy stays under that limit. Codex has no such filter: it reviews
every file when a pull request is opened or marked ready for review, or when
someone comments `@codex review`.

`.github/workflows/release.yml` versions and publishes the packages. See
[Releasing](releasing.md).

## Installed application scenarios

Run `vp run build && vp run test:scenarios` from the root. The matrix is also
the final step of `vp run validate`. It copies `fixtures/apps/` outside the
workspace and installs freshly packed tooling and runtime packages with Bun's
hoisted and isolated linkers. Every case runs lint, TypeScript, node and dom
tests, build and output checks. SSR cases also request the local preview.

The fixtures list 7, 7 and 9 direct dependencies including the injected packages
(client-only, SSR plain and SSR i18n). The package supplies the development
tools. The fixtures list their own pinned dependencies, and the first test of
the file fails when a version, an override or the engines differ from the
workspace. No browser download or remote page request belongs to this suite;
only dependency installation uses the network. Paraglide uses a local project
without remote modules.

To select a case, use Node's `--test-name-pattern` with
`packages/solid-tooling/src/tarball/__tests__/tarball.scenarios.test.ts`. For
example:

```bash
node --test --test-timeout=180000 --test-name-pattern='ssr-i18n / isolated' packages/solid-tooling/src/tarball/__tests__/tarball.scenarios.test.ts
```

The build audit rejects packaged development tools in every emitted module
inventory, while allowing the Nitro and routing entries used by the server at
runtime. There is no exception for tooling modules. SSR plain requires
`solid-runtime/src/env/index.js` in a server graph; the client audit rejects
that fragment and Valibot. Select `client-only / isolated$` with
`SCENARIO_MUTATION=missing-dependency` to remove `unplugin-icons` from the
packed manifest before installation; the scenario must fail when loading the
preset. `SCENARIO_MUTATION=tool-bundle` imports the real packaged formatter from
the temporary application and must fail at the bundle audit. Both probes leave
the workspace manifest unchanged.

The optional `SCENARIO_MUTATION` values `nitro`, `headers` and `dom` inject
regressions only into temporary copies. Select `client-only / isolated` for
Nitro and `ssr-plain / isolated` for the other two; each command must fail. See
[ADR 0021](ADRs/0021-installed-application-scenarios.md) for coverage and cost.

The locale seam adds an `ssr-plain / isolated-language` case with
`language: 'de'`, checked in node and dom. SSR fixtures render a runtime locale
link: unprefixed without translations and prefixed with /fr with them. The
client-only fixture uses `createLocalizedNavigate` and `localeTag` while its
bundle audit keeps rejecting translation modules. It tests unprefixed DOM
navigation, query, hash, state, history and the single-language `setLocale`
no-op. Its additional `isolated-language` case sets `language: 'zh-Hant-TW'`.
The matrix has nine application cases plus the version-alignment test. The
alignment check also resolves and compares every runtime production dependency
against the workspace catalog and application/tooling pins.

The locale negative probes use `SCENARIO_MUTATION=locale-provider` or
`locale-node` with `ssr-plain / isolated$`, and `locale-prefix` with
`ssr-i18n / isolated$`. The provider probe needs the generated runtime of the
boilerplate copy (run `vp run i18n:generate` there first). It adds that provider
only in the temporary application's build, after the tests, so the unchanged
bundle audit must reject it. The node probe removes the locale stand-in from the
installed tooling in that temporary application. Each probe must fail at its
intended assertion; temporary copies are removed in finally.

The runtime request locale tests compile their own de/fr/ja translation project
before Vitest. The copied application's request localization and redirect tests
now live in that package. Run both development and production E2E suites in the
copy when changing this request boundary.

The ssr-i18n fixture has real fr/de/it/ja catalogs in `src/i18n/` and uses the
preset's packaged generator and Vite plugin without an application script or
plugin. The shared fixture App keeps its original message access; the matrix
changes that access to `scenario_greeting` only in its temporary copy, matching
the catalog ID convention without editing the shared App. Its smoke checks the
root redirect, the German page, Content-Language and cookie persistence. The
request negative probes are `request-target` and `request-step` on ssr-i18n, and
`request-plain` on ssr-plain, selected with SCENARIO_MUTATION.

Navigation probes use `SCENARIO_MUTATION=navigation-provider` and
`locale-setter` with `client-only / isolated$`, and `locale-tag` with
`ssr-i18n / isolated$`. Each must fail. The first rewires the installed
navigation module to the runtime's generated test provider, so run the runtime
tests or root validate first to generate it. The second removes only the
single-language setter from the installed tooling. The third changes the
expected HTML tag. The SSR smoke normally checks fr-FR and de-DE. Mutations
affect only owned temporary installations and are removed in finally.

## Optional runtime theme

The ssr-i18n fixture configures the runtime theme, renders a script with a nonce
matching CSP, and checks no explicit class without a cookie and dark class plus
dark theme-color with the cookie. The other scenarios reject runtime theme
modules in all bundle audits. Select `ssr-plain / isolated$` with
`SCENARIO_MUTATION=theme-import`, or `ssr-i18n / isolated$` with `theme-nonce`
or `theme-color`, to prove the assertions fail.

The boilerplate configures theme once in `src/constants/theme.ts`. Its theme
adapters, types and primitive tests moved to the runtime package, which now runs
node and happy-dom projects. UI and CSS remain in the copy. See
[ADR 0024](ADRs/0024-runtime-theme.md).

## Runtime server errors

The seven server error modules and their unit tests live in
`packages/solid-runtime/src/infra/server/`. The application retains its thin
`src/infra/server/configureServerErrors/index.ts` setup and colocated public
message catalogs. Publication-controller integration stays in the application;
runtime test helpers live in `tooling/testing`, excluded from coverage and
publication. See [ADR 0028](ADRs/0028-runtime-server-errors.md).

The root validation includes the backend policy tests through the tooling
package's `test` script. They exercise nine import restrictions and five private
API type checks, including variable and spread uses of `allowControl`.

Both SSR scenarios load serverSetup and expose `/server-error`, localized in the
i18n fixture. The smoke rejects private markers in the full body and in the
preview's stdout and stderr after process closure, and requires a fixed
`[server-error]` log line. German uses its catalog; the Italian callback throws
and must produce the English default. Public error identity and render
observation are checked through the installed package entries. Each SSR case
then imports a server module from the client entry and requires a boundary
plugin build failure.

Run optional `SCENARIO_MUTATION=error-body` or `error-log` probes with
`--test-name-pattern='ssr-plain / isolated$'`. They mutate only the installed
runtime in the owned temporary application after lint and unit tests. Each must
fail at its body or log marker assertion, respectively. Normal validation does
not set the variable. Commands remove inherited `NODE_ENV`, use bounded
deadlines and verify the owned PID and process group before termination.

Run the copy's full check, Node types, dead-code, coverage, tooling and both E2E
suites separately from package builds and the installed matrix. The existing
BackendError, OutsideError and OutdatedPage tests and production log teardown
remain required for this boundary.

## Runtime middleware and entry helpers

The copy calls `createMiddleware({ security, extra, document })` from the
runtime, binding its security instance and Markdown adapter. The runtime owns
failure containment, its request-locals declaration and 54 former application
tests. The copy retains all composed-chain assertions and E2E fixtures. The SSR
entries use `createRenderOptions()`; the client entry uses
`prepareClientLocale()` and retains outdated-page detection and its HMR cleanup.
The authored trees and Document's client-entry literal stay unchanged.

Both installed SSR scenarios use the same factory and entry helpers, with no
translation provider in ssr-plain. Their smoke also checks middleware failures
before and after rendering, bodyless controls, public messages and security
headers; the drained preview log must contain the filtered middleware line.
Client-only tests exercise client preparation without translations.

Optional `SCENARIO_MUTATION=middleware-body` and `middleware-headers` probes on
`ssr-plain / isolated$` must fail the body-marker and failure-header assertions.
Mutations and fixture instrumentation live in
`packages/solid-tooling/src/tarball/scenario-mutations.ts` and only modify
temporary installations. A runtime chain test requires security before the
terminating API handler. See [ADR 0029](ADRs/0029-runtime-middleware-chain.md).

## Runtime SEO

The copy's route metadata resolver, head publisher, JSON-LD serializer and
robots factory live in the runtime with 41 migrated executable tests and the
exclusive-mode type test. Application adapters inject editorial values and the
Markdown alternate callback. The sitemap service and publication controller are
runtime factories, as are Markdown and llms. Artifact writers belong to compiled
tooling. The application owns one controller shared by both publication
workloads, plus editorial values and route wrappers. Runtime tests also cover
optional fields and hostile strings in both site and custom structured data.
Keep the copy's StructuredData security E2E gate.

SSR plain now renders metadata and JSON-LD on `/` and `/catalog/42`, and serves
robots GET/HEAD and an unprefixed sitemap with array and partitioned sources.
Its `isolated-meta-only` profile uses an explicit site URL, no origin
environment variable and no robots route. Both invalid scheme and path origins
must fail enabled SEO with a named diagnostic; the meta-only profile builds
successfully with those same unused values.

The build audit rejects SEO modules in client-only and robots/sitemap server
modules in every client graph. SSR i18n verifies all four locale alternates and
`x-default`. The `isolated-without-sitemap` plain profile keeps robots and
publication enabled but requires no sitemap route, service module, robots
announcement or static header rule. `SCENARIO_MUTATION=sitemap-import` with
`ssr-plain / isolated-without-sitemap$` plants a used server import; the build
audit must fail. Run `SCENARIO_MUTATION=seo-import` with
`client-only / isolated$` to plant a used import in the owned temporary
application; the audit must fail. The smoke and mutations are separate modules
under `src/tarball`, keeping the matrix runner focused on orchestration. See
[ADR 0031](ADRs/0031-runtime-seo-core.md) and
[ADR 0033](ADRs/0033-runtime-sitemap-publication.md).

## Packaged environment schemas

`ssr-plain` uses `serverEnv` from `@evertondgn/solid-runtime/env`, adds
`SCENARIO_LABEL` and `VITE_SCENARIO_LABEL`, and declares no direct Valibot
dependency. It reuses the fragment's nonempty-string validator for those
application keys. The other fixtures keep no `env.ts`. Both linkers load the
installed fragment in plain Node, require the old tooling export to be absent,
and check exact inferred types, including optional numeric `PORT`, and confirm
that the client type exposes only its public key. A first build generates
declarations before lint and TypeScript on the clean installation; the later
instrumented build checks the bundle graph.

The preview smoke reads the application's server variable through an `extra`
step of the middleware factory and checks a value different from the build
environment. The public value is baked into the HTML. Each SSR plain case then
starts preview with `PORT=abc`, requests the lazy server and requires HTTP 500
plus the boot diagnostic naming `PORT`. It also injects a used server env import
into the client entry and requires the plugin's boundary error, restores the
entry, and retains the existing runtime server-only probe. These negative checks
run in normal `validate`, including both linkers. See
[ADR 0030](ADRs/0030-packaged-environment-schemas.md) and the
[environment API](tooling/app-config.md#optional-environment-validation).

## Packaged fonts

The copy declares its two Inter subsets in `fonts.ts` and passes that data to
`defineSolidApp`. `FontLinks` replaces its manual preload;
`src/theme/tokens/fonts.css` retains only typography tokens. The binaries,
family, weight range, style, display and Unicode ranges remain the same.

The installed client-only and SSR plain fixtures generate a 448-byte original
CC0 WOFF2 font from `src/tarball/font-fixture.ts`, without a new dependency.
Both linkers audit single emission, external CSS, absence of inline style and
exact CSS/preload hash equality. SSR i18n retains the no-font case and rejects
font assets, face declarations and bundled runtime font modules. The matrix
still has nine installed cases plus version alignment.

Use `SCENARIO_MUTATION=fonts-href` or `fonts-inline` with
`ssr-plain / isolated$`, and `fonts-import` with `ssr-i18n / isolated$`, to
prove the corresponding audit fails. These mutate only the temporary
installation. Run the copy's test suites separately from package builds and the
matrix; its production E2E checks the real CSP. See
[ADR 0032](ADRs/0032-packaged-fonts.md) and the [font API](tooling/fonts.md).

## Markdown and llms publication

The runtime owns pure path, listing, selection and serialization tests. The
compiled tooling owns prerender and artifact tests. The copy retains
integration, patch regressions and end-to-end assertions. Configure publication
through `seo`; `publication` is removed and `extend` no longer constructs the
pipeline.

The installed matrix adds four SSR plain profiles under the isolated linker:
`isolated-markdown-only`, `isolated-llms-only`, `isolated-publication-off` and
`isolated-dynamic-only`. The all-enabled cases still run with both linkers and
with/without i18n. There are fifteen cases including version alignment.
`SCENARIO_MUTATION=llms-budget` on `ssr-plain / isolated$` must fail the build;
`llms-link` and `llms-module` on `ssr-plain / isolated-publication-off$` must
fail the bundle/config audit. See
[ADR 0034](ADRs/0034-runtime-markdown-publication.md).
