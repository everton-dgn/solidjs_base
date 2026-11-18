# Tooling guides

The tooling guides moved to
[`packages/solid-tooling/docs/`](../../packages/solid-tooling/docs/README.md),
which ships in the npm package of `@evertondgn/solid-tooling`, so an app reads
the guides of the version it installed
([ADR 0040](../ADRs/0040-package-docs-ship-with-the-package.md)). The other
files of this folder keep the old addresses for the links of published npm
pages.

[Applications with no server](no-server.md) stays here, because the installed
application scenarios read it to check that its theme plugin matches the one
they build.
