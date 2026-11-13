# 0013. Knip and Stylelint configs ship in the tooling package

- Status: Accepted
- Date: 2026-11-13

## Context

An application built from boilerplate_solidjs carried its own Knip config
(`tooling/knip.ts`, 136 lines), its Stylelint config
(`tooling/css/stylelint.config.mjs`, 171 lines), the script that runs it
(`tooling/css/check.ts`, 46 lines) and 14 tests of the CSS policy. Most of it is
the same in every application: the entries the Solid plugin loads by path, the
routes found by `filesystem-routing` and the whole CSS policy.

A test application outside the workspace, with the package installed by tarball,
tried both configs from a package before the move:

| Question                                             | Result                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Knip config from the package, routes from a `root`   | The resolved config matched the original, and the reports of normal and `--strict` mode were the same, byte for byte, with and without an unused file |
| Importing the package from the Knip config           | Knip adds the `--config` file to the production entries, so `--strict` reported the package as an unlisted dependency of that file                    |
| Ignoring the package by name in `ignoreDependencies` | `--strict` passed, but an import of the package from `src/` was no longer reported                                                                    |
| Ignoring `unlisted` only in the config file          | `--strict` passed and still reported an import of the package from `src/`                                                                             |
| Stylelint config and plugin from the package         | The CSS lint passed and reported the same rules; the application could no longer import `stylelint` or `stylelint-use-nesting`                        |
| An application without the theme reference files     | Stylelint 18 stops the run with a `ConfigurationError` when a `referenceFiles` entry matches no file                                                  |

Knip also reports an entry or a project pattern without files, and an ignore
that matches nothing, as configuration hints, which fail the run with
`treatConfigHintsAsErrors`.

## Decision

- `./knip` exports `defineKnipConfig({ root, configFile, entry, ... })`. It
  lists the convention entries, the routes and fixture routes found by
  `filesystem-routing`, and the project patterns, each one only when the
  application has the file or the folder. It ignores `unlisted` issues only in
  `configFile`, which defaults to `tooling/knip.ts`.
- What depends on the application is an option: more entries, ignored binaries
  and dependencies, ignored issues and excluded issue types.
- `./stylelint` exports `defineStylelintConfig(root)` and `checkCss(root)`,
  which also checks the CSS file names. The theme references enter only when
  they exist. The messages are in English, as [ADR 0007](0007-english.md) asks.
- `stylelint` and `stylelint-use-nesting` are dependencies of the package, and
  the plugin is passed to Stylelint by a path resolved from the package. `knip`
  and `filesystem-routing` are optional peer dependencies, pinned to exact
  versions like the others ([ADR 0002](0002-compiled-tooling-package.md)).

## Consequences

- The boilerplate copy keeps `tooling/knip.ts` (48 lines) and
  `tooling/css/check.ts` (11 lines) at the same paths, because the tasks of
  `vite.config.ts` run them. It lost the Stylelint config, the 14 policy tests
  and the two Stylelint dependencies.
- The policy tests run in the package, against a temporary application with only
  the tokens they use, together with tests of the compiled configs for
  applications without fixture routes or theme files.
- `--strict` no longer reports any unlisted import inside the Knip config file,
  not only the one of this package.
- The CSS lint messages of the copy changed from Portuguese to English.
- A missing default is silent: if an application deletes its middleware, Knip
  stops listing it instead of reporting an empty entry.
- The convention entries assume that `vite.config.ts` loads the Solid plugin
  with `import()`, as `./vite` does. An application that imports it statically
  sets `solidPluginImport: 'static'`, so Knip's Solid plugin lists them instead.
- The tarball test checks that the files of `./knip` and `./stylelint` exist,
  not that they run from an installed package. A copy of the application
  installed from the tarball covers that before a release.
