# 0030. The runtime package supplies optional environment validators

- Status: Accepted
- Date: 2026-11-14

## Context

The copy repeated Valibot schemas for the variables consumed by the Vite, Vitest
and Playwright presets. Minimal installed fixtures had no environment schema.
Applications without server or site configuration must continue to work without
one, and application variables must not become package requirements.

The first implementation put the fragment in the tooling package. Knip's strict
production check then required that package in the application's `dependencies`,
bringing the tools centralized by ADR 0027 into production-only installations.
The server schema belongs to the runtime package instead.

## Decision

Export `serverEnv` from `@evertondgn/solid-runtime/env`, as plain JavaScript
with a handwritten declaration. It contains optional `HOST`, `PORT` and
`BASE_URL_TEST` schemas with the copy's existing rules: a nonempty host, decimal
digits transformed to an integer between 0 and 65535, and a URL. The application
spreads that object into its `server` map and adds its own Standard Schema keys.
`VITE_SITE_URL` remains in the copy's `client` map.

The installed Solid plugin loads `env.ts` with Vite's `runnerImport`, using
project resolution. The server virtual module imports the schema into the server
bundle; a schema file alone adds no boot validation to raw env reads. The entry
uses `types` and `default`, following the runtime's security header constants,
so Node does not need to load TypeScript or enable the `solid` condition. The
fragment imports only Valibot, supplied by the runtime at the root catalog
version. The bundle audit rejects every tooling module without exception and
requires the runtime fragment in the SSR plain server graph. Env validation adds
neither the fragment nor Valibot to the browser.

No helper wraps the plugin's `{ server, client }` contract. Ordinary spread
allows an application to replace a preset key; preserving those validators is an
explicit application responsibility. Mixed Standard Schema libraries remain
supported by the plugin. No application is required to adopt the fragment or to
create `env.ts`, and the preset's client-only behavior is unchanged.

## Evidence

The installed SSR plain scenario loads the packaged JavaScript export directly
in plain Node and requires the former tooling export to be absent. Its real
build loads `env.ts` through the module runner and bundles the fragment only on
the server. Strict TypeScript checks cover inference through `solid-env.d.ts`,
including `number | undefined` for `PORT`, public client keys and no server keys
in the client type. The fixture declares no Valibot, including with the isolated
Bun linker. Runtime contract tests bind the handwritten declaration's
input/output types to the actual JavaScript outputs and preserve every optional,
boundary and malformed-value case.

SSR plain permanently checks these contracts with both linkers. Its middleware
reads an application server variable with a preview value different from the
build value. A public variable reaches the HTML. Preview with `PORT=abc` fails
server initialization with the per-key diagnostic; Nitro lazily loads the server
on the first request, so its listener remains running and the request returns
HTTP 500. Importing the server virtual module into the client entry fails the
build. Existing no-schema, optional-feature and server-error cases remain.

## Consequences

The correction replaces the unreleased tooling export with the runtime export.
The copy keeps its validation rules and dependency versions, declaring the
runtime in `dependencies` and the tooling in `devDependencies`. Knip's normal
and strict passes retain their checks. Production-only installs no longer pull
the tooling package through the env fragment. Applications that only import the
fragment need no direct Valibot declaration, including isolated installations.
Applications that write validators using Valibot retain their own dependency, as
the copy does.

The generated declarations describe virtual modules and do not augment
`ImportMetaEnv`. The copy keeps its declaration merging for `VITE_SITE_URL` and
`PUBLICATION_BUILD_ID`. A clean application must start dev or build to generate
`solid-env.d.ts` before type checking. No environment loader, parser or test
stub was added to the presets. The fragment does not change raw env reads, and
the Playwright preset keeps its additional explicit-port requirement.
