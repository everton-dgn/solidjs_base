# 0039. tsrs checks the types instead of tsc

- Status: Accepted
- Date: 2026-11-17
- Amends: the `tsc` task and the `typescript` dependency of
  [0027](0027-packaged-tool-dependencies.md)

## Context

Vite+ 1.7.0 replaced `oxlint-tsgolint`, the backend of the type-aware lint, with
[tsrs](https://github.com/oxc-project/tsrs), a Rust port of the TypeScript 7
compiler that `vite-plus` installs as a dependency. The tooling package still
shipped `typescript` for its uncached `tsc` task and for `typecheck-node`, so an
application installed two compilers: the lint checked with tsrs, on the
TypeScript 7.1 beta, and the command line with `tsc` 7.0. On the
`tsconfig.node.json` of the standalone boilerplate, both checked the same 1469
files with the same diagnostics, and tsrs took about a third of the time.

The options were:

- Keeping `tsc` for the command line.
- Shipping `tsrs` in the tooling package, at the version that `vite-plus`
  depends on.
- Resolving `tsrs` through `vite-plus`, without declaring it. A strict layout,
  such as Bun's isolated linker, does not expose a dependency of a dependency to
  the package that needs its binary.

## Decision

- The tooling package ships `tsrs` from the catalog, pinned at the version that
  `vite-plus` depends on, and registers a `tsrs` task in place of `tsc`.
  `typecheck-node` runs it.
- The check of the workspace versions in the tarball scenarios fails when the
  catalog pins another `tsrs` than `vite-plus`, so an application installs a
  single copy.
- The icons package checks the types of its packed fixture with `tsrs` too.
- `typescript` stays as a development dependency of the packages whose `vp pack`
  writes declarations, because the `tsgo` generator of tsdown requires
  TypeScript 7.0.

## Consequences

- An application runs `vp run tsrs --noEmit` instead of `vp run tsc --noEmit`.
  The rename is a breaking change of the tooling package.
- `vp migrate` does not update the `tsrs` entry of the catalog, so a Vite+
  update also sets that entry to the new `dependencies.tsrs` of `vite-plus`.
- tsrs is a beta: it has no `--init` and no `--showConfig`, its `--watch` does
  not run on Windows, and pnpm with `trustPolicy: no-downgrade` rejects it
  ([known limits](../tooling/limits.md#known-limits)).
