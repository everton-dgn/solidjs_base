# 0037. Icons come from a Vite plugin package of this monorepo

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
- The package takes `vite-plus` and `@solidjs/web` as peer dependencies. The
  rule that keeps `vite-plus` and the other build tools out of the production
  sections is the rule of the runtime package, which applications install in
  production; a Vite plugin runs in the build of the application, with the Vite+
  the application installs, so its peer is that installation and not a copy of
  its own. The other build tools of the package, such as `@solidjs/vite-plugin`,
  stay in `devDependencies`, and its tarball test checks that none of them
  reaches `dependencies` or `optionalDependencies`.
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
- The SVG files of a folder collection are code of the application: the package
  does not sanitize them. It guarantees that their markup stays markup. The
  component and the SVG text of `?raw` are written again from the elements,
  attributes and text that the file parses to, and the build stops on markup
  that runs code (`<script>`, event handlers, `javascript:` URLs, an animation
  of `href`), on markup that a page reads as HTML (an element outside SVG 2,
  `<foreignObject>`, an element in `<title>`, `<desc>` and `<style>`, a `<` in
  the text of `<style>`) and on markup that JSX reads as code. `?raw` escapes
  `&`, `<` and `"` in the values and `&` and `<` in the text, and leaves out
  comments, processing instructions and the DOCTYPE. A copy of the file kept the
  comments and the processing instructions, which the parser of the package
  skips and the HTML parser of a page ends at another `>`: an `<img>` with an
  event handler hidden in one ran when the text was set with `innerHTML`. The
  data that drawing applications write for themselves, such as `<metadata>` and
  the `inkscape:` namespace, is left out with a warning. Writing the markup into
  JSX as it was let an element such as `<globalThis.fn/>` call a function at
  render and let `innerHTML` reach the server output as HTML; both were
  reproduced before the change. An SVG that a user uploads still needs a
  sanitizer at runtime.
- A folder icon is read only when the listing of the folder has its exact file
  name, so a link, a name in another case and a path outside the folder are
  refused on every file system. The file is opened without following a link and
  read only if it is a regular file, so a file replaced by a link after the
  listing is refused too, except on Windows, which has no such flag.
- A folder that cannot be read, a collection that is declared and not installed,
  and a declaration file that cannot be written log a warning and stop only the
  imports that need them, so the dev server keeps running.
- Measured on the development machine, one run at a time, as the median of three
  runs of the same round:
  - A reader in another process saw 25 to 46 partial files in about 2,000 reads
    while the declaration file was written in place, and none once it is written
    to a temporary file and renamed.
  - A new SVG file rendered the declarations twice, once per environment of the
    dev server, and a burst of ten files twenty times; they render once and four
    times now.
  - Twenty loads of a collection started at once read and parsed `icons.json`
    twenty times through `@iconify/utils`; a cache of the promise reads it once.
  - With 500 icons, the filters of the resolve and load hooks cut their calls
    into the plugin from 1,241 and 551 to 501 each. The bundle is the same, byte
    for byte, by name, by path and with the plugin the tooling uses today. The
    build took 6 to 15 ms more than with that plugin, before and after the
    change.
  - Writing `?raw` again from the parsed markup costs what the copy of the file
    cost, measured against the compile of the component in the same round on a
    loaded machine: the 6,117 icons and aliases of `hugeicons` took 1.08 times
    the components before and after, and an SVG of 3.1 MB with 150,000 elements
    took 0.74 and 0.77 times its component.
  - The name table and the declarations of `hugeicons`, 6,106 names, take about
    25 ms and write 485 KB; a synthetic collection of 20,200 names takes about
    60 ms and writes 1.6 MB. They are computed once per dev session and again
    only for a folder collection whose files change.
  - The first page of the dev server takes the same time as with the plugin the
    tooling uses today, within the noise, for 2, 50 and 500 icons. A hot update
    of an edited SVG of a folder took 40 to 120 ms, with a watcher that polls
    every 50 ms. With the current plugin, in the configuration the tooling uses,
    the edited SVG did not update in nine runs.
