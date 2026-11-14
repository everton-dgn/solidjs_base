# 0029. The tooling package supplies optional environment validators

- Status: Accepted
- Date: 2026-11-14

## Context

The copy repeated Valibot schemas for the variables consumed by the Vite, Vitest
and Playwright presets. Minimal installed fixtures had no environment schema.
Applications without server or site configuration must continue to work without
one, and application variables must not become package requirements.

## Decision

Export `serverEnv` from `@evertondgn/solid-tooling/env`, compiled as JavaScript
with generated declarations. It contains optional `HOST`, `PORT` and
`BASE_URL_TEST` schemas with the copy's existing rules: a nonempty host, decimal
digits transformed to an integer between 0 and 65535, and a URL. The application
spreads that object into its `server` map and adds its own Standard Schema keys.
`VITE_SITE_URL` remains in the copy's `client` map.

The installed Solid plugin loads `env.ts` with Vite's `runnerImport`, using
project resolution. The server virtual module imports the schema into the server
bundle; a schema file alone adds no boot validation to raw env reads. Compiled
tooling keeps the validator beside its existing Valibot dependency and works
without a special `solid` condition or manual declaration file. The fragment
imports only Valibot. The bundle audit permits that exact compiled entry only in
the SSR plain server graphs; all other tooling entries remain forbidden. Env
validation adds neither the fragment nor Valibot to the browser.

No helper wraps the plugin's `{ server, client }` contract. Ordinary spread
allows an application to replace a preset key; preserving those validators is an
explicit application responsibility. Mixed Standard Schema libraries remain
supported by the plugin. No application is required to adopt the fragment or to
create `env.ts`, and the preset's client-only behavior is unchanged.

## Evidence

Before adding the API, a temporary package compiled the proposed fragment and
installed it with the isolated Bun linker. A build and strict TypeScript check
proved inference through `solid-env.d.ts`, including `number | undefined` for
`PORT`, public client keys and no server keys in the client type. Valibot could
not resolve from the application root, yet schema loading and the build passed.
The compiled fragment imported only Valibot; the browser inventory contained
neither. The pilot completed in 5.25 seconds, including cleanup, with cached
dependencies. This is a functional check, not a throughput benchmark.

SSR plain permanently checks these contracts with both linkers. Its middleware
reads an application server variable with a preview value different from the
build value. A public variable reaches the HTML. Preview with `PORT=abc` fails
server initialization with the per-key diagnostic; Nitro lazily loads the server
on the first request, so its listener remains running and the request returns
HTTP 500. Importing the server virtual module into the client entry fails the
build. Existing no-schema, optional-feature and server-error cases remain.

## Consequences

This is an additive API: existing applications need no migration. The copy
adopts it without changing its validation rules or dependency versions. Adopters
declare the tooling package in `dependencies`, because Knip treats `env.ts` as a
production entry and its strict pass rejects the import from `devDependencies`.
The copy moves that one declaration and retains all Knip checks. Production-only
installs therefore include the package's tools too, while the bundle audit
continues to exclude them. Config-only applications can retain their existing
development dependency. Applications that only import the fragment need no
direct Valibot declaration, including isolated installations. Applications that
write validators using Valibot retain their own dependency, as the copy does.

The generated declarations describe virtual modules and do not augment
`ImportMetaEnv`. The copy keeps its declaration merging for `VITE_SITE_URL` and
`PUBLICATION_BUILD_ID`. A clean application must start dev or build to generate
`solid-env.d.ts` before type checking. No environment loader, parser or test
stub was added to the presets. The fragment does not change raw env reads, and
the Playwright preset keeps its additional explicit-port requirement.
