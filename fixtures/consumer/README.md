# Test application

The test in `packages/solid-tooling/src/tarball/__tests__/tarball.test.ts`
copies this folder to a temporary directory, installs the packed package and
runs lint.

The files in `src/` break rules on purpose: one for each plugin of the package,
one from the Solid plugin and one type error. `clean.ts` and `vite.config.ts`
are the controls and must produce no diagnostics.

The fixture declares only what an application has to declare. Bun's isolated
linker does not hoist dependencies, so if the package uses a dependency it does
not declare itself, the test fails here.
