# 0028. Server error protection belongs to the runtime

- Status: Accepted
- Date: 2026-11-14

## Decision

Move isControlResponse, logServerFailure, renderIntegrity, publicErrors,
publicationScope, protectServerOperation and configureServerErrors to
`packages/solid-runtime/src/infra/server/`. Each has a kebab-case `server/`
export with the `solid` condition, no barrel, and its `server-only` import. The
application retains transports, publication controllers and sources, middleware
containment, the chain and render entries. Dependency ownership and
peerDependencies stay unchanged.

`configureServerErrors({ publicMessage? })` installs both the invocation wrapper
and the synchronous Solid error hook. The callback takes a string locale from
the runtime locale seam, without a translation dependency. The default is
`The request could not be completed.`. Locale or callback failures and invalid
callback results use that default without logging or reusing the thrown value.
The application owns its public text, configures it once in serverSetup, and
never receives the original error through this callback.

The setter has no public export. The public operation wrapper accepts only
`run`, rejects `allowControl` in types, and does not forward extra options at
runtime. Only the internal registration variant enables framework controls.
There is no AST rule attempting to follow arbitrary option flows.

The application keeps `src/infra/server/configureServerErrors/index.ts` as its
setup, with the `configureServerErrors_message` catalogs next to it. The lint
reserves the package configurator for that path and recognizes the package
render-integrity subpath. Dynamic literal and static-template imports cannot
bypass those restrictions. Existing exact-path exceptions still apply inside the
runtime package.

## Verification

The eight original test files retain their cases and assertions across the
runtime and application. Publication controller integration and the real
application catalog remain in the copy; runtime helpers live in
`tooling/testing`, outside coverage and the tarball. The runtime tsconfig loads
the Solid boundary-module types. Its render state declaration is imported by the
implementation so installed consumers see the augmentation.

The backend policy suite carries the fourteen former bypass cases: nine import
restrictions and five private API type checks. Their tests fail against the
unrestricted prototype and pass with the final policy and public surface.

Installed SSR fixtures exercise the error hook, public error identity and render
observation under both Bun linkers. Preview checks public bodies, German text,
an Italian callback failure with English fallback, and the complete stdout and
stderr after closing the server. The build rejects a used server-only import
from the client entry. Optional mutations leak the original message into the
body or log and must fail the corresponding assertion. See
[ADR 0021](0021-installed-application-scenarios.md).

## Limits

The callback can deliberately return private text; application review owns that
contract. Structural output checks cannot detect secrets in arbitrary strings.
Development keeps the existing original-error diagnostics. The module identity
tests cover one installed runtime version in each application, not multiple
versions, HMR or cross-process state. Installed previews do not prove
deployment, late streaming or navigation; the complete copy retains its separate
E2E gates.
