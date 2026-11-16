# Changelog

## [0.8.0](https://github.com/everton-dgn/solidjs_base/compare/solid-runtime@0.7.0...solid-runtime@0.8.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* @evertondgn/solid-runtime and @evertondgn/vite-plugin-solid-icons take @solidjs/web 2.0.0-rc.23 as their exact peer, and @evertondgn/solid-tooling installs that version of the icons plugin, so an application on Solid 2.0.0-rc.21 no longer meets them. Update solid-js and @solidjs/web to 2.0.0-rc.23 together, with the overrides of @solidjs/signals and @solidjs/compiler at the same version, and remove a patchedDependencies entry for @solidjs/web@2.0.0-rc.21: the new version ends a render whose default serializer fails synchronously before the first flush, and a render abandoned inside its first write no longer ends the Node process. The types of HydrationContext no longer declare serialize; write hydration values through getHydrationWriter of @solidjs/web.
* **runtime:** @evertondgn/solid-runtime declares Node 26.13.1 or later in engines.node. Run the application, including its production server, on Node 26.13.1 or a later version. A package manager that checks engines warns about, or refuses, an older Node.

### Bug Fixes

* require Solid 2.0.0-rc.23 ([4689ef0](https://github.com/everton-dgn/solidjs_base/commit/4689ef0418142078e13582956e72091b830b6001))
* **runtime:** require Node 26 ([93bc52d](https://github.com/everton-dgn/solidjs_base/commit/93bc52dfb5e5685d914ed33c55da620588bd70c4))

## [0.7.0](https://github.com/everton-dgn/solidjs_base/compare/solid-runtime@0.6.0...solid-runtime@0.7.0) (2026-11-15)


### Features

* **runtime:** persist the theme choice in localStorage ([319c842](https://github.com/everton-dgn/solidjs_base/commit/319c842a7fa4f23f8112ff0797950759a8bce8f1))
* **runtime:** set theme-color once the meta follows the stored theme script ([0eadfff](https://github.com/everton-dgn/solidjs_base/commit/0eadfff449be17cf6ae9c7f7b8ed670651ec99df))

## [0.6.0](https://github.com/everton-dgn/solidjs_base/compare/solid-runtime@0.1.0...solid-runtime@0.6.0) (2026-11-15)


The version number follows `@evertondgn/solid-tooling`: both packages share the same number from this release on.


### Bug Fixes

* **runtime:** keep the Solid plugin out of production installs ([927cbee](https://github.com/everton-dgn/solidjs_base/commit/927cbee44f67f9c245c561f74b037aac0dedaf79))
