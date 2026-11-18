---
name: solid-icons
description: Rules for icons from @evertondgn/vite-plugin-solid-icons, which defineSolidApp loads. Use when importing, renaming or re-exporting an icon from an icon module, adding an Iconify collection or a folder of SVG files, predicting the export name of an icon, getting the SVG markup with ?raw, typing icon names or the src/icon-collections.d.ts file, or fixing a build or type error that names an icon.
---

# Solid icons

Icons are Solid components imported through the `icon:` scheme. `defineSolidApp`
loads the plugin, so the application does not declare it; without the preset,
add `solidIcons()` to the Vite+ config, as the [README](../../README.md) shows.

## Two import forms

- By name: `import { ArrowLeft01 as Back, Github } from 'icon:hugeicons'`.
  Rename with `as` and re-export as with any module. The build rewrites each
  name into the import of that one icon.
- By path, as the default export:
  `import IconGithub from 'icon:hugeicons/github'`. Spell the file or Iconify
  name exactly. Every icon has a path, even one with no export name, and
  `import('icon:hugeicons/github')` loads it when the page needs it.
- Add `?raw` to a path for the SVG markup as a string. Any other query, `?url`
  included, stops the build.
- The build refuses `import * as`, a default import of the collection,
  `export *`, `import 'icon:hugeicons'` and `import('icon:hugeicons')`.
- Names are rewritten only in the application's JavaScript and TypeScript files
  outside `node_modules`. In another file, such as `.mdx`, import by path.
- An icon takes the props of an `<svg>`, applied after its own attributes, and
  renders at 1.2em unless the file sets its size. The preset adds
  `aria-hidden="true"` to every icon: give an icon that stands alone
  `aria-hidden="false"` and an `aria-label`.

## Collections

- An Iconify collection is an installed `@iconify-json/<collection>` package. An
  icon of the whole `@iconify/json` package loads by its path, but the typed
  names cover only `@iconify-json/*` packages.
- A folder collection maps a name to a folder of SVG files, relative to the
  root: `icons: { brand: './src/assets/icons' }` in `defineSolidApp`, or
  `collections` in `solidIcons()`. `logo.svg` there is `icon:brand/logo` and
  can also be imported by name: `import { Logo } from 'icon:brand'`.
- A collection name has lowercase letters, digits and single hyphens. A folder
  with the name of an installed collection takes its place.
- An import names the file in its exact case on every file system. A symbolic
  link to an SVG file is not read, and a file name that an import cannot spell,
  such as `my icon.svg`, has no import, only a warning.
- Review SVG files as code. The build stops on `<script>`, an event handler
  attribute, a `javascript:` URL, `<foreignObject>`, an HTML element and a file
  that is not well-formed XML.

## Names and types

- The export name is the icon name in PascalCase, split at every character that
  is not a letter or a digit: `arrow-left-01` is `ArrowLeft01`, `logo.v2` is
  `LogoV2`, and a leading digit adds `Icon`, as in `Icon3dMove`.
- When two icons give the same name, neither gets it: each takes a strict name
  with an underscore, as `ArrowDown_01`, or only its path.
- A name such as `Map` or `Text` hides that global in the module. Rename it on
  import: `import { Map as MapIcon } from 'icon:hugeicons'`.
- The dev server, the build and `vp run icons-generate` write the typed names in
  `src/icon-collections.d.ts`. With the preset, keep it out of Git; the
  `lint-project` and `check-project` tasks write it first, so run
  `vp run icons-generate` before a bare `vp lint` or `vp run tsrs`.
- Without the preset, `writeIconTypes` writes that file before a type check and
  `checkIconTypes` fails in CI when a committed file is behind the icons.

## An unknown name

- A typo stops the build and the dev server with an error. A close match gets a suggestion, as in
  `"Githb" is not an icon of 'icon:hugeicons'. Did you mean Github?`, and the
  type check can report TS2724 for a close match. Fix the import: the
  declaration file is generated.
- `Icon collection "mdi" not found` means the package is not installed and no
  folder has that name. A name of two icons lists the strict name of each.

## Guides

- [Icons plugin reference](../../docs/README.md): the task index of the guides.
- [Imports](../../docs/imports.md): both import forms, `?raw` and the refused
  forms.
- [Collections](../../docs/collections.md): Iconify packages, folders and dev
  server edits.
- [SVG files](../../docs/svg-files.md): what the build refuses in an SVG file.
- [Names](../../docs/names.md): how an icon name becomes an export.
- [Types](../../docs/types.md): the declaration file, `writeIconTypes` and
  `checkIconTypes`.
- [Build errors](../../README.md#build-errors-that-name-the-icon): the message
  of each missing icon.
