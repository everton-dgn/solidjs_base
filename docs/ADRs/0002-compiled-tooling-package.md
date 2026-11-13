# 0002. The tooling package ships compiled JavaScript

- Status: Accepted
- Date: 2026-11-11

## Context

`vp lint`, `vp check` and `vp build` load `vite.config.ts` in Node, and the lint
preset loads its plugins from the package. Node 24.22.3, the version this
project uses, refuses to run TypeScript from `node_modules`
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). In the experiment, tooling
shipped as `.ts` broke both `vp lint` and `vp run build` in the application.
Shipped as `.js`, it passed both. Bun accepts the `.ts` files, so the failure
only shows under Node.

Inside a workspace the package is linked, not installed, and the link hides the
failure.

## Decision

`@evertondgn/solid-tooling` is built with `vp pack` into ES modules in `dist/`,
with type declarations. `vite-plus` and `@inlang/paraglide-js` are peer
dependencies pinned to the exact versions the package is tested with.
`eslint-plugin-solid` is a dependency of the package, re-exported through
`./solid-plugin`.

A tarball test packs the package, installs it in a copy of `fixtures/consumer`
and lints files that break each plugin.

## Consequences

- The package has to be built before its CLI tests and before `apps/boilerplate`
  loads it.
- The tarball test catches a package that only works through the workspace link.
- Upgrading Vite+ or Paraglide in an application needs a package version tested
  with the new versions first.
