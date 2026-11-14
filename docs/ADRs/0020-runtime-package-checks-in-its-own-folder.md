# 0020. The runtime package runs its checks in its own folder

- Status: Accepted
- Date: 2026-11-13

## Context

[ADR 0018](0018-runtime-package-middleware.md) recorded that the files moved to
`packages/solid-runtime` lost checks they had in the application. The root lint
gave them the overrides the preset writes for `src/`, mapped to
`packages/solid-runtime/src/`. Four rules read the path relative to the folder
where lint runs, so from the root they never matched the package files: the
architecture rule, the SEO module rule, the test file name rule and the CSS
Module file name rule. Knip did not run on the package, and nothing packed it.

A probe measured:

| Question                                                          | Result                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp lint` in the package folder, with the preset from the sources | Planted files failed on `backend(static-solid-imports)`, `architecture(layer-imports)`, `typescript(no-floating-promises)` and a type error |
| `vp check` in the package folder                                  | It uses the `lint` and `fmt` blocks of the root, as the Vite+ guide states; with the root ignoring the package, it found no file to lint    |
| `vp fmt` in the package folder, without a `fmt` block there       | It used the settings of the root                                                                                                            |
| Knip in the package folder, with no entry in its config           | It read the nine targets of `exports`, the ones under the `solid` condition included                                                        |
| Knip `--strict` in the package folder                             | It reported `filesystem-routing/api`, which the package declares as an optional peer                                                        |

## Decision

- The package lints itself: its `check` script runs `vp lint` in its folder,
  where the rules read `packages/solid-runtime/src/` as the `src/` of an
  application. Every override and path rule of the preset applies without a
  mapping. The preset turns on `typeAware` and `typeCheck`, so the same run
  checks the types with `packages/solid-runtime/tsconfig.json`.
- The script is `vp lint` and not `vp check`, because `vp check` in a workspace
  package uses the blocks of the root.
- The root lint ignores `packages/solid-runtime/**` and no longer maps the
  `src/` overrides to it. Each file is linted by one run: 56 files at the root,
  20 in the package.
- Formatting stays at the root, which still covers the package, and the package
  runs no formatter. The Docs job of the CI runs only `vp fmt --check` at the
  root, and a change to the package README alone starts only that job.
- The package `vite.config.ts` loads the plugins from
  `packages/solid-tooling/src`, as the root does. The two configs repeat that
  map, because each writes the paths from its own folder.
- The root `check` script runs `vp check` and then the `check` of the packages.
  A new `dead-code` script runs the `dead-code` of the packages, and `validate`
  runs build, check, dead code, tests and the tarball tests, in this order.
- The package `dead-code` script runs Knip in the default and the `--strict`
  modes, as the application tasks do, through `defineKnipConfig` from the
  tooling sources, unchanged. Knip reads the entries from `exports`, so the
  config lists none. It ignores `srvx`, which a regression test resolves through
  `nitro`, and `filesystem-routing` in the production run only, because
  `--strict` does not accept an optional peer. It skips the catalog check: the
  catalog is in the root `package.json`, which Knip does not read from the
  package folder. `knip` is a development dependency of the package, at the
  version the tooling package and the copy use.
- The package `test:tarball` script runs a `node:test` suite in
  `tooling/tarball/__tests__/`, a folder that `files` does not publish and that
  the preset treats as tooling. The suite packs the package with `vp pm pack`,
  extracts it to `node_modules/@evertondgn/solid-runtime` of a temporary folder,
  without the network and without the peers, and removes both folders at the
  end. Node does not run the TypeScript of the package, so the suite proves
  three things and only them:
  - `constants.js` loads in plain Node from the installed package, through
    `@evertondgn/solid-runtime/middleware/security-headers/constants`, with the
    values of the source;
  - every target of `exports` is in the tarball;
  - no `__tests__` folder is published.

This replaces the point of ADR 0018 on the root lint and its consequence that
the moved files lost the architecture rule and Knip.

## Consequences

- One planted file per family failed `vp run validate` at the root: a dynamic
  import of `@solidjs/web`, an import of a test file and a floating promise
  failed the package `check`, and an unused module failed `dead-code`.
- The new checks cost about 2 seconds. Measured alone, the package lint takes
  0.5 to 1 second, Knip in its two modes about 0.7 seconds and the tarball test
  about 0.4 seconds, and the root lint dropped from 74 files to 56.
- The total of `vp run validate` does not show that cost. It took 21 to 22
  seconds before and after the change, and 33 to 38 seconds in later runs of the
  same commit on the same machine: it depends on the load of the machine more
  than on these checks.
- The SEO module and CSS Module file name rules now reach the package, but it
  has no `seo.ts` and no CSS today.
- A rule change reaches the package lint without a build, because its config
  loads the preset from the sources.
- The tarball test does not compile the `.ts` entries. The boilerplate copy
  compiles them, through the workspace link.
