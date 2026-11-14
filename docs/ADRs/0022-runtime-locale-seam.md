# 0022. Runtime locale helpers use an application virtual module

- Status: Accepted
- Date: 2026-11-14

## Context

Runtime consumers may have no translation project, including desktop apps.
Moving helpers that import the generated translation runtime directly would make
translations mandatory.

## Decision

The runtime exports each module separately: i18n/locale, i18n/urls,
i18n/build-locale-alternates and middleware/append-vary. The locale entry reads
virtual:solid-app/locale, with string locale types. The preset resolves that
module to a neutral ID and forwards the application's generated runtime when
project.inlang/settings.json exists. Otherwise it provides one locale from
language, default en, with unchanged hrefs and URLs and no URL locale match. The
same provider is available in development, builds and all Vitest projects,
including the node project's stand-ins.

The tooling package publishes ambient declarations through virtual-modules,
loaded by tsconfig.app.json. Its build owns the exports map. The runtime's own
tsconfig includes that declaration by relative path. No triple-slash reference
or additional application configuration is required.

## Rejected alternative

Having the runtime import @paraglide/* and adding aliases in the preset fails
the installed package contract: the application's paths replaces the inherited
map, and resolution from the application fails with Bun's isolated linker. The
virtual module makes the application boundary explicit without making the
runtime depend on a translation generator. Neither its public name nor its
resolved ID contains a translation provider name. The bundle audit remains
unchanged.

## Consequences

The copied helpers retain their behavior and import the locale seam. Runtime
tests use fr/de/ja without the generator. Installed fixtures exercise actual
providers, both linkers, node/dom tests, SSR links and a custom language.
Request localization, persistence, redirects, locale tags, LocalizedLink and
messages remain application responsibilities. Only imports of moved helpers
change in those consumers. Peer dependencies and dependency ownership stay
unchanged. E2E remains a CI responsibility.
