# 0033: Sitemap and publication admission belong to the runtime

- Status: Accepted
- Date: 2026-11-14

## Context

The application carried a reusable sitemap service and process-local publication
controller. Sitemap and Markdown share admission, cancellation, output budgets
and producer lifetime. Extracting only one caller or creating multiple
controllers would change those limits. The build writer and reader also share
artifact paths, versions and byte bounds that must remain aligned.

## Decision

Move the controller, sitemap service, route factories, source types and their
regressions to `solid-runtime`. Bind routes through
`createSitemapRoutes({ publication, sources, siteUrl, ...options })` in a
server-only application module. Keep one controller instance shared by sitemap
and Markdown. Registries and database adapters remain server-only application
code; no configuration option accepts an application module path.

Use a plain JavaScript `server/publication-protocol` export with literal
handwritten declarations and a declaration/value regression. The artifact writer
and Markdown prerender stay in the application until their coupled build
integration moves together. `usesArtifacts: true` selects that existing reader;
standalone installed applications use direct collection by default.

The locale seam supplies unprefixed URLs without language alternates when i18n
is absent. Configured i18n keeps locale groups and x-default. Type-only sitemap
imports carry the router augmentation without exposing server code to clients.
The runtime uses private package imports for internal paths, independent of the
consumer's `@/` alias.

Make `seo.sitemap` opt in to static sitemap header rules independently of the
existing `publication` rules. Routes and robot announcements remain explicit.
Disabled installations remove route bindings and sources, omit sitemap paths in
robots and omit the flag. Keep robots available without sitemap.

Preserve protocol bounds, positive configurable admission limits, total source
deadline, limit-plus-one partition reads and cancellation through producer
settlement. Keep default limits unchanged. The public documentation
distinguishes complete route/array/index work from bounded partition work and
process-local caches from persistence.

Amend ADR 0021: SSR plain includes array and partitioned sources in both
linkers; SSR i18n verifies alternates and x-default. One isolated profile
disables sitemap while keeping robots and publication. A planted server import
must fail the module audit. Helpers own smoke tests and mutations outside the
matrix runner.

## Consequences

Application imports change and the copy explicitly enables `seo.sitemap`. Its
public artifacts and HTTP responses must remain equal to the release base, using
independent spike comparators. Moving tests must preserve all cases and
assertions; application counts decrease as runtime counts increase.

The package owns Node reader and prerender-environment lint exceptions. It does
not grant applications new access to Node, private logs or arbitrary networking.
The extraction does not prove production CDN behavior, unlimited catalog size,
or global admission across replicas. It does not move llms, Markdown conversion
or build artifact generation into the packages.
