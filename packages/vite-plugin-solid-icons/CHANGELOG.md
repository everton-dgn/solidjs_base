# Changelog

## [0.10.0](https://github.com/everton-dgn/solidjs_base/compare/vite-plugin-solid-icons@0.9.0...vite-plugin-solid-icons@0.10.0) (2026-11-18)


### ⚠ BREAKING CHANGES

* **icons:** @evertondgn/vite-plugin-solid-icons requires @solidjs/web 2.0.0. Update solid-js and @solidjs/web to 2.0.0 together, with the overrides of @solidjs/signals and @solidjs/compiler at the same version.

### Bug Fixes

* **icons:** require Solid 2.0.0 ([368cac1](https://github.com/everton-dgn/solidjs_base/commit/368cac1a799ce6d90a446fb786825915a2e7dd94))

## [0.9.0](https://github.com/everton-dgn/solidjs_base/compare/vite-plugin-solid-icons@0.8.0...vite-plugin-solid-icons@0.9.0) (2026-11-17)


### ⚠ BREAKING CHANGES

* **icons:** @evertondgn/vite-plugin-solid-icons requires vite-plus 1.7.0. Update vite-plus and the vite alias together, with vp migrate or by setting the alias to the output of npm view vite-plus@1.7.0 dependencies.vite.

### Bug Fixes

* **icons:** require Vite+ 1.7.0 ([7b1833f](https://github.com/everton-dgn/solidjs_base/commit/7b1833fe52bb84a08e359c73adf20fc0e1c45154))

## [0.8.0](https://github.com/everton-dgn/solidjs_base/compare/vite-plugin-solid-icons@0.7.0...vite-plugin-solid-icons@0.8.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* @evertondgn/solid-runtime and @evertondgn/vite-plugin-solid-icons take @solidjs/web 2.0.0-rc.23 as their exact peer, and @evertondgn/solid-tooling installs that version of the icons plugin, so an application on Solid 2.0.0-rc.21 no longer meets them. Update solid-js and @solidjs/web to 2.0.0-rc.23 together, with the overrides of @solidjs/signals and @solidjs/compiler at the same version, and remove a patchedDependencies entry for @solidjs/web@2.0.0-rc.21: the new version ends a render whose default serializer fails synchronously before the first flush, and a render abandoned inside its first write no longer ends the Node process. The types of HydrationContext no longer declare serialize; write hydration values through getHydrationWriter of @solidjs/web.
* **icons:** @evertondgn/vite-plugin-solid-icons declares Node 26.13.1 or later in engines.node. Run the build of the application on Node 26.13.1 or a later version. A package manager that checks engines warns about, or refuses, an older Node.

### Bug Fixes

* **icons:** require Node 26 ([85c8f11](https://github.com/everton-dgn/solidjs_base/commit/85c8f114efd5610549caddb37cd40dbf4e0777e5))
* **icons:** update magic-string to 1.4.5 ([e935af8](https://github.com/everton-dgn/solidjs_base/commit/e935af8d94becc3f70bea2906a9c129c2dffcd70))
* require Solid 2.0.0-rc.23 ([4689ef0](https://github.com/everton-dgn/solidjs_base/commit/4689ef0418142078e13582956e72091b830b6001))
