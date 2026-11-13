# Security policy

## Supported versions

The packages are in `0.x`. Fixes go into a new release of the latest minor
version; older versions do not get patches.

| Package                     | Supported            |
| --------------------------- | -------------------- |
| `@evertondgn/solid-tooling` | Latest `0.x` release |

## Reporting a vulnerability

Do not open a public issue. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/everton-dgn/solidjs_base/security/advisories/new).
Include the package and version, what an attacker can do, and the steps or files
that reproduce it.

The report stays private until a fix is released. The fix ships as a new
version, and the advisory is published with credit to you, unless you ask
otherwise.

## Scope

- The packages published from `packages/`.
- The release workflow, which publishes to npm with
  [trusted publishing](https://docs.npmjs.com/trusted-publishers). Each version
  on npm carries a provenance statement that links it to the commit and the
  workflow run that built it.

`apps/boilerplate` is a test copy of
[boilerplate_solidjs](https://github.com/everton-dgn/boilerplate_solidjs) and is
never deployed. Report problems in the application code to that repository.
