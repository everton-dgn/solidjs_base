# 0036. Icons come from a Vite plugin package of this monorepo

- Status: Accepted
- Date: 2026-11-15

## Context

`defineSolidApp` loads a third-party icon plugin and passes it the `icons`
option, the folders of SVG files of the application. An application imports one
icon per path, and the declaration of those imports,
`apps/boilerplate/src/@types/icons.d.ts`, accepts any name: a typo in an icon
name passes the type check and only fails in the build.

The applications of this repository use one bundler, Vite+, and one framework,
SolidJS 2. They need icons from installed Iconify collections and from their own
SVG folders, rendered on the server and in the browser, with `aria-hidden` on
every icon.

The options were:

- Keeping the current plugin, with one import per path and no typed names.
- Writing the icon support inside `@evertondgn/solid-tooling`. The plugin would
  then only reach applications that adopt the whole preset, and its releases
  would be tied to every change of the tooling.
- A package of its own in this monorepo, for Vite+ and Solid 2 only.

## Decision

- `@evertondgn/vite-plugin-solid-icons`, in `packages/vite-plugin-solid-icons`,
  is a Vite+ plugin that turns the icons of `@iconify-json/<collection>`
  packages and of folders of SVG files into Solid 2 components. It supports no
  other bundler and no other framework. It loads the icons with `@iconify/utils`
  and leaves the component to the Solid plugin of the application, so the
  installed Solid compiler writes the DOM and the server output.
- Icons are imported through the `icon:` scheme: `icon:<collection>/<name>` for
  one icon, `icon:<collection>/<name>?raw` for its SVG text, and
  `import { Name } from 'icon:<collection>'` for the icons of a collection by
  name. No other query is accepted.
- The imports by name are rewritten by a transform, before the build, into the
  imports of one icon each, so a collection never becomes a module and the
  bundle carries only the icons the application names. The namespace import, the
  default import, `export *` and `import()` of a collection have no names to
  read, and the build refuses them with the imports to use.
- The dev server and the build write a declaration file with one module per
  collection and one export per name, `src/icon-collections.d.ts` by default.
  `writeIconTypes` and `checkIconTypes` write and check the same file outside of
  them, for an editor that opens before the dev server and for the CI.
- The rule that derives the name of an icon from its file or Iconify name is
  part of the public API, described in the README of the package. A name that
  two different icons claim is never exported; each of them gets its strict
  name, or only its import by path. A change to the rule renames imports in the
  applications, so it is a breaking change.
- The package starts at version `0.0.0`, outside `release-please-config.json`
  and `.release-please-manifest.json`. The maintainer publishes its first
  version [by hand](../releasing.md#publishing-by-hand), because a trusted
  publisher needs the package to exist on npm, and then adds it to the release
  automation
  ([First automated release](../releasing.md#first-automated-release-of-a-package)).
- The switch of `defineSolidApp` to this plugin, the generated declarations in
  the tooling and the migration of the imports of the boilerplate app are a
  second step, after the first publication. Until then, the tooling and the app
  keep the plugin they use today.

## Consequences

- An application imports icons by name, with a type error that suggests the
  closest name, and the build stops on a missing icon with the name it asked
  for.
- The applications depend on a plugin that this repository maintains. A new
  Vite+ or Solid 2 release candidate needs a release of the package tested with
  it, as the other two packages do.
- The package has to be released before the tooling version that depends on it,
  and the installed application scenarios need its tarball once the tooling
  depends on it.
- The declaration file of a large collection is large: `hugeicons` alone
  declares 6,106 names. The formatter, the linter and Knip of an application
  have to leave it out, which the second step adds to the presets.
- Some names of a collection are also global names, such as `Map` and `Math` in
  `hugeicons`. An application renames them on import.
- Until the second step, the repository holds two ways to load icons, and the
  docs of the tooling and the app describe the one they still use.
