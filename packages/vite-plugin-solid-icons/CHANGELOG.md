# Changelog

## [0.8.0](https://github.com/everton-dgn/solidjs_base/compare/vite-plugin-solid-icons@0.7.0...vite-plugin-solid-icons@0.8.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* @evertondgn/solid-runtime and @evertondgn/vite-plugin-solid-icons require @solidjs/web 2.0.0-rc.23. Update solid-js and @solidjs/web to 2.0.0-rc.23 together, with the overrides of @solidjs/signals and @solidjs/compiler at the same version, and remove a patchedDependencies entry for @solidjs/web@2.0.0-rc.21: the new version ends a render whose default serializer fails synchronously before the first flush, and a render abandoned inside its first write no longer ends the Node process. The types of HydrationContext no longer declare serialize; write hydration values through getHydrationWriter of @solidjs/web.
* **icons:** @evertondgn/vite-plugin-solid-icons declares Node 26.13.1 or later in engines.node. Run the build of the application on Node 26.13.1 or a later version. A package manager that checks engines warns about, or refuses, an older Node.
* @evertondgn/solid-runtime and @evertondgn/vite-plugin-solid-icons require @solidjs/web 2.0.0-rc.22. Update solid-js and @solidjs/web to 2.0.0-rc.22 together, with the overrides of @solidjs/signals and @solidjs/compiler at the same version, and remove a patchedDependencies entry for @solidjs/web@2.0.0-rc.21: the new version covers both of its cases. With skipLibCheck off, TypeScript reports TS2305 for heldRead in the types of @solidjs/web; the tsconfig of the tooling turns skipLibCheck on.

### Bug Fixes

* **icons:** require Node 26 ([85c8f11](https://github.com/everton-dgn/solidjs_base/commit/85c8f114efd5610549caddb37cd40dbf4e0777e5))
* **icons:** update magic-string to 1.4.5 ([e935af8](https://github.com/everton-dgn/solidjs_base/commit/e935af8d94becc3f70bea2906a9c129c2dffcd70))
* require Solid 2.0.0-rc.22 ([bfd1ad8](https://github.com/everton-dgn/solidjs_base/commit/bfd1ad8b92319924e9c2fdb7be3d21e3d4079a93))
* require Solid 2.0.0-rc.23 ([4689ef0](https://github.com/everton-dgn/solidjs_base/commit/4689ef0418142078e13582956e72091b830b6001))
