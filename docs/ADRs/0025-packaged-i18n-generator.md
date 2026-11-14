# 0025. Colocated catalog generation belongs to the tooling package

- Status: Accepted
- Date: 2026-11-14

## Context

The application preset invoked `tooling/i18n/generate.ts`, and each application
supplied its own catalog plugin through `extend`. That made shared tooling
depend on application implementation files. The existing validator and watcher
already read locale settings rather than requiring a fixed locale set.

## Decision

Move catalog discovery, validation, aggregate preparation, generation and the
Vite adapter to `packages/solid-tooling/src/i18n/`, together with all 36 tests.
The tests use de/fr/it and an additional ja locale instead of pt/en/es.

`defineSolidApp` loads the adapter lazily when `project.inlang/settings.json`
exists, in application dev/build and each dom/browser test project. Each target
gets its own plugin instance. Metadata-only commands and applications without
that file do not load the generator. The `i18n-generate` task resolves the
compiled package entry relative to the preset. The build generates the
`./i18n-generate` export; application scripts and manual plugins disappear.

Applications can set `i18nPlugin: false` to disable the automatic compilation
plugins and optionally replace them through `extend`. The locale providers and
test setup still follow the settings file. The generation task stays
independently replaceable by name through `tasks`, including with the automatic
plugin disabled.

Catalogs remain at `src/**/i18n/<locale>.json`. Existing parity, duplicate ID,
parameter and byte-budget checks retain their diagnostics. Compiler settings and
the message-format plugin remain application-owned. The validator resolves that
parser from the application root so an isolated installation uses the same
declared plugin without adding a peer. The package keeps it only as a
development dependency for tests and types. SDK and Valibot become package
dependencies; the copy keeps Valibot because its source imports it. Existing
peers are unchanged.

## Consequences

The ssr-i18n scenario uses the packaged generator and colocated catalogs under
both linkers. It still checks redirects, translated HTML, Content-Language and
cookies, and now asserts both i18n plugin names. Its shared App fixture is kept
unchanged for parallel work: the harness adapts its original `m.greeting()` to
`m.scenario_greeting()` only in the owned temporary copy. No catalog naming
exception is added to the package.

The copy drops one direct dependency, the SDK. The ssr-i18n fixture drops none:
its Paraglide and message-format declarations remain required. The package ships
the generator's SDK and Valibot even for consumers without translations, but
loads the generator only when needed. Preparation still scans the full catalog
set and keeps the 8 MiB limit; runtime bundles contain no generator code.

Verification covers the original and moved tests, byte-for-byte generated output
comparison, the installed application matrix, root validate and both application
E2E suites. Negative probes exercise missing translations, duplicate IDs and
removal of the fixture's translation project.
