[![Latest vite-plugin-solid-icons version on npm](https://img.shields.io/npm/v/@evertondgn/vite-plugin-solid-icons)](https://www.npmjs.com/package/@evertondgn/vite-plugin-solid-icons)
[![CI workflow status](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml/badge.svg)](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml)
[![Node version that vite-plugin-solid-icons requires](https://img.shields.io/node/v/@evertondgn/vite-plugin-solid-icons)](#requirements)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/everton-dgn/solidjs_base/blob/main/LICENSE)

# @evertondgn/vite-plugin-solid-icons

**Every icon of an Iconify collection or of your own SVG folder, imported by
name as a typed SolidJS 2 component, with only the icons you use in the
bundle.**

Icons in a Solid app come from two places: a large icon set and the SVG files of
your design. Pasting their markup into components means copying paths by hand,
keeping sizes consistent and finding a typo only when the icon is missing from
the page. This Vite plugin turns both sources into components at build time. You
import an icon by name, TypeScript knows every name of the collection, and the
build stops with the name you asked for when an icon does not exist.

> This package is `0.x` ([versions](#versions-and-license)). It pins its
> `@solidjs/web` and `vite-plus` peer dependencies to the versions it is tested
> with, listed in its
> [`package.json`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/package.json),
> so update them together.

## Requirements

| You need      | Solid Base expects                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node          | The range in `engines.node` of the [package manifest](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/package.json), shown by the Node badge above |
| Vite+         | `vite-plus` at the exact version of the `peerDependencies` in the manifest. The plugin reads your imports with the parser that `vite-plus` exports                                        |
| Solid         | `@solidjs/web` at the exact version of the `peerDependencies`, and `@solidjs/vite-plugin` in the plugins of your app                                                                      |
| Icon sets     | One `@iconify-json/<collection>` package for each Iconify collection you import. A folder of your own SVG files needs no package                                                          |
| Folder checks | The checks that keep an icon inside its folder are tested on macOS and Linux                                                                                                              |

## Install

Install it as a dev dependency, with one `@iconify-json/<collection>` package
for each Iconify collection the application imports:

```bash
vp add -D @evertondgn/vite-plugin-solid-icons @iconify-json/hugeicons
```

Applications built on `@evertondgn/solid-tooling` do not install this package:
`defineSolidApp` already loads it, and they add only the
`@iconify-json/<collection>` packages. See the
[tooling README](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/README.md).

## See it work

### A typo in an icon name stops the build

An import by name is checked twice, by the build and by the type check:

```ts
// src/typo.ts
import { Githb } from 'icon:hugeicons'

export const icon = Githb
```

```text
$ vp build
[plugin vite-plugin-solid-icons] src/typo.ts:1:9
RolldownError: "Githb" is not an icon of 'icon:hugeicons'. Did you mean Github?
1: import { Githb } from 'icon:hugeicons'
            ^

$ vp check
  x typescript(TS2724): '"icon:hugeicons"' has no exported member named 'Githb'. Did you mean 'Github'?
```

We ran this on 2026-11-17 with the 0.8.0 packages from npm, in a copy of a
fixture app of this repository (file path shortened). That app is built on
`@evertondgn/solid-tooling`: `defineSolidApp` loads this plugin, and the lint
preset turns on the type check in `vp check`. The build error comes from this
plugin. The type error comes from the declaration file the plugin writes with
the names of each collection.

The same day, an app with only this plugin and the config of [Set up](#set-up)
failed the build with the same error. Its `vp check` let the typo through until
`lint.options` set `typeAware: true` and `typeCheck: true`; then it reported the
same TS2724. CI also runs `tsrs` on the same file in a new app that installs the
packed plugin ([How it is tested](#how-it-is-tested)). An import by path, as in
`icon:hugeicons/githb`, has no such check: it passes the type check and stops
only at the build ([known limits](#known-limits)).

### Only the icons you import reach the bundle

```tsx
import { ArrowLeft01, Github } from 'icon:hugeicons'
import { Logo } from 'icon:brand'

export function Footer() {
  return (
    <footer>
      <ArrowLeft01 />
      <Github class="social" />
      <Logo />
    </footer>
  )
}
```

`hugeicons` is an installed Iconify collection and `brand` is a folder of SVG
files in the application. The plugin rewrites each name into the import of one
icon module, marked without side effects, so the bundle carries these three
icons and nothing else of either collection. The test
[`app.test.ts`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/src/__tests__/app.test.ts)
builds an app that imports six icons, one of them from two modules, with
`hugeicons` installed. It finds the attributes of six icon components in the
client bundle, and the path of the shared icon once.

## Set up

Add the plugin next to the Solid plugin in `vite.config.ts`:

```ts
import { solidIcons } from '@evertondgn/vite-plugin-solid-icons'
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  plugins: [
    solidIcons({
      collections: { brand: './src/assets/icons' },
      customizeIcon: ({ attributes }) => {
        attributes['aria-hidden'] = 'true'
      }
    }),
    solid({ ssr: true })
  ]
})
```

The plugin writes no `aria-hidden` of its own. The `customizeIcon` above hides
every icon from assistive technology, which suits icons next to a text label;
give an icon that stands alone an `aria-label` and drop the `aria-hidden` from
it, as in `<Github aria-hidden="false" aria-label="GitHub" />`.

Load the module declarations in the `tsconfig.json` of the application:

```json
{
  "compilerOptions": {
    "types": ["@evertondgn/vite-plugin-solid-icons/icon-modules"]
  }
}
```

The declarations of the names of each collection live in a file that the dev
server and the build write, `src/icon-collections.d.ts` by default. A
`tsconfig.json` that includes `src` already reads it. See
[Typed names](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/types.md).
`vp check` type-checks these imports only when `lint.options` in
`vite.config.ts` sets `typeAware` and `typeCheck` to `true`; the lint preset of
`@evertondgn/solid-tooling` sets both.

## Who it fits

- You build a SolidJS 2 app on Vite+ and want the icons of an Iconify collection
  or of your own SVG folder as components, without pasting markup.
- Your app is on `@evertondgn/solid-tooling`. `defineSolidApp` already loads
  this plugin, so you install only the `@iconify-json/<collection>` packages
  ([icons in the application config](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/docs/app-config.md#icons)).
- You want a typo in an icon name to fail the type check and the build, with the
  closest name in the message.

## Who it does not fit yet

- Your app uses another bundler or another UI framework. The plugin supports
  only Vite+ and SolidJS 2.
- Your app shows SVG files that users upload. The checks of the plugin do not
  make an untrusted SVG safe, and such a file needs a sanitizer at runtime
  ([what the plugin does with your SVG files](#what-the-plugin-does-with-your-svg-files)).
- You cannot pin exact versions. `vite-plus` and `@solidjs/web` are exact peers
  in the
  [`package.json`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/package.json).
- You run Node older than the `engines.node` floor of the package.
- You build folder collections on Windows and rely on the checks that keep an
  icon inside its folder. Those checks are tested on macOS and Linux
  ([collections](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/collections.md)).

## Questions before you adopt it

**Do I need `@evertondgn/solid-tooling`?** No. Any Vite+ app with SolidJS 2 can
add the plugin next to its Solid plugin, as [Set up](#set-up) shows. An app on
the tooling does not install it at all ([Install](#install)).

**Is an SVG file safe once it builds?** The build stops on markup that runs code
in a page, such as a `<script>`, an event handler attribute, a `javascript:`
URL, an HTML element or a `<foreignObject>`. The checks do not make an untrusted
SVG safe: they leave external references, such as an `<image>` that points to a
URL, or a CSS `url()`. Review the SVG files of a folder as you review code
([the full list](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/svg-files.md)).

**Does it render on the server and hydrate?** Yes. The icon module goes through
the Solid plugin of the app, so a server build and the dev server render it with
`renderToString`. The test
[`hydration.test.ts`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/src/__tests__/hydration.test.ts)
renders two icons in a server build and hydrates them in a browser without
adding, replacing or changing a node.

**What happens when a collection updates?** An import renders whatever the new
version ships under that name, with no error when the drawing changed. A running
dev server keeps the old version until you stop and start it
([known limits](#known-limits)).

**What does it add to the install?** Two production dependencies,
`@iconify/utils` and `magic-string`. Each Iconify collection you use is a
package of its own. The plugin runs in the build, so it is a dev dependency.

**Where did this version come from?** The release workflow publishes through npm
trusted publishing, and each version it publishes carries npm provenance (an
SLSA v1 provenance statement) that names the commit and the workflow run that
built the tarball. It says nothing about bugs in the code. The first version was
published by hand and has no statement
([security policy](https://github.com/everton-dgn/solidjs_base/blob/main/SECURITY.md)).
In an app that installed the package, `npm audit signatures` verifies the
registry signatures and attestations of the installed packages.

## Build errors that name the icon

A missing icon stops the build and the dev server with the name you wrote and,
for an import by name, the line and column of that name in your file. These are
the real messages:

| Import                                         | Message                                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import { Githb } from 'icon:hugeicons'`       | `"Githb" is not an icon of 'icon:hugeicons'. Did you mean Github?`                                                                                                                        |
| `import { ArrowDown01 } from 'icon:hugeicons'` | `"ArrowDown01" names more than one icon of 'icon:hugeicons': import ArrowDown_0_1 for arrow-down-0-1, ArrowDown_01 for arrow-down-01, or 'icon:hugeicons/arrow-down01' for arrow-down01.` |
| `import X from 'icon:hugeicons/no-such-icon'`  | `Icon "hugeicons/no-such-icon" not found in @iconify-json/hugeicons.`                                                                                                                     |
| `import X from 'icon:brand/moon'`              | `Icon "brand/moon" not found: the folder "src/assets/icons" of the collection "brand" has no moon.svg.`                                                                                   |
| `import X from 'icon:mdi/home'`                | `Icon collection "mdi" not found: install @iconify-json/mdi or declare "mdi" in the collections option of solidIcons.`                                                                    |
| `import X from 'icon:hugeicons/github?url'`    | `Unsupported query in the icon import "icon:hugeicons/github?url": only ?raw is accepted.`                                                                                                |
| `import X from 'icon:brand/../secret'`         | `Invalid icon import "icon:brand/../secret". Import an icon as 'icon:<collection>/<name>', or 'icon:<collection>/<name>?raw' for the SVG text.`                                           |

The suggestion is the closest name within three edits, ignoring case. A name can
only use letters, digits, `_`, `-` and dots between them, so an import cannot
read a file outside the folder of its collection. The names follow one fixed
rule, described in
[Names you can predict](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/names.md).

## What the plugin does with your SVG files

The SVG files of a folder collection are part of your application, as its source
files are: the plugin does not sanitize them, and you review them as you review
code. What the plugin guarantees is that the markup of a file stays markup. The
build stops, with the icon and the reason, on markup that runs code in a page,
such as a `<script>`, an event handler attribute or a `javascript:` URL, on
markup that a page reads as HTML, such as `<foreignObject>`, and on a file that
is not well-formed XML. The icons of an installed collection go through the same
checks. They do not make an untrusted SVG safe: they leave external references,
such as an `<image>` that points to a URL, or a CSS `url()`. An SVG that a user
uploads needs a sanitizer at runtime.
[The full list](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/svg-files.md)
covers every check.

## Options

| Option          | Type                                         | Default                       | Description                                                                                                     |
| --------------- | -------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `collections`   | `Record<string, string>`                     | `{}`                          | Folders of SVG files by collection name, relative to the Vite root                                              |
| `customizeIcon` | `({ collection, name, attributes }) => void` | none                          | Edits the attributes of the `<svg>` element of every icon, of both kinds of collection; it may return a Promise |
| `typesFile`     | `string \| false`                            | `'src/icon-collections.d.ts'` | The declaration file of the names, relative to the Vite root, or `false` to write none                          |

`customizeIcon` receives the name of the collection, the name of the icon and
the attributes as an object of strings, which it edits in place. A value is
text: the plugin escapes `&`, `"`, `<` and `>` in the values it sets and keeps a
`$`, which `@iconify/utils` would read as a pattern of `String.replace`, so
write them as they are. A name that is not an attribute name, or a value that is
not a string, stops the build with the icon and the attribute, and an event
handler is refused as in a file:

```ts
solidIcons({
  customizeIcon: ({ collection, attributes }) => {
    attributes['aria-hidden'] = 'true'
    if (collection === 'flags') attributes.class = 'flag'
  }
})
```

| Entry point                                        | Content                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@evertondgn/vite-plugin-solid-icons`              | `solidIcons`, `writeIconTypes` and `checkIconTypes`, the types of `/types`, and `IconTypesOptions` and `IconTypesFile` |
| `@evertondgn/vite-plugin-solid-icons/types`        | `IconComponent`, `IconCustomization`, `IconCustomizer` and `SolidIconsOptions`, without the types of Vite              |
| `@evertondgn/vite-plugin-solid-icons/icon-modules` | The declarations of the imports by path and of `?raw`, for `types` in `tsconfig.json`                                  |
| `@evertondgn/vite-plugin-solid-icons/package.json` | The package manifest                                                                                                   |

## Update the packages

In an app on the tooling, the plugin comes with `@evertondgn/solid-tooling`, at
the same version. Raise the tooling and the runtime in one command:

```bash
vp update -L @evertondgn/solid-tooling @evertondgn/solid-runtime
```

Then align the versions the packages were tested with: `solid-js`,
`@solidjs/web` and the Solid overrides, `vite-plus`, and Paraglide in an app
with translations. The root README explains each step in
[Update the packages](https://github.com/everton-dgn/solidjs_base/blob/main/README.md#update-the-packages).

An app that installs the plugin alone raises it by its name:

```bash
vp update -L @evertondgn/vite-plugin-solid-icons
```

`-L` is needed while the package is `0.x`: a range such as `^0.8.0` stops below
0.9.0. Then set `vite-plus` and `@solidjs/web` to the exact versions in the
`peerDependencies` of the new version, which
`npm view @evertondgn/vite-plugin-solid-icons peerDependencies` prints, with the
`vite` alias that `vp migrate` writes for that `vite-plus`, and align `solid-js`
and the Solid overrides with `@solidjs/web` as the root README describes. Do not
raise `solid-js` with `-L`: the newest Solid release can be newer than the one
the plugin was tested with. The
[release notes](https://github.com/everton-dgn/solidjs_base/releases) list the
breaking changes.

## How it is tested

In the CI run of the 0.10.0 release pull request, the
[Packages job](https://github.com/everton-dgn/solidjs_base/actions/runs/44206537981/job/134474054049)
ran 194 tests of the plugin in 39 suites and the 8 tests of its packed tarball,
and all of them passed (`ℹ tests 194` and `ℹ tests 8` in the job log). The
package has 25 test files, counted in the source tree, including the tarball
test. The files in `src/__tests__/` build apps or start a dev server with Vite+
and the Solid plugin in temporary folders, and the browser tests run in the CI
runner's Chrome. Three files cover security, hostile names and hydration:

- [`security.test.ts`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/src/__tests__/security.test.ts):
  text and attribute values that would run code if they reached the page as
  written, such as a `{...}` expression in a text or `"><img onerror="...">` in
  an attribute value, render as text on the server and in the browser, without
  running. A `<script>` element, an element that is not SVG, markup that would
  leave the SVG, a file that is not well-formed and a DOCTYPE entity stop the
  build with the icon and the problem. An import reads no file outside the
  folder of its collection, the dev server refuses a path traversal, and a
  symbolic link out of the folder is not followed. These checks leave external
  references and a CSS `url()` in place, so they do not make an untrusted SVG
  safe.
- [`hostileNames.test.ts`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/src/writeIconTypes/__tests__/hostileNames.test.ts):
  file and icon names that would close a comment, open a string or a template,
  break a line or reach the prototype keep the declaration file valid
  TypeScript. An installed collection whose name an import cannot spell is left
  out, neither of two names that differ only in case is exported, and imports of
  names that are keywords are rewritten.
- [`hydration.test.ts`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/src/__tests__/hydration.test.ts):
  a server build renders two icons, one with a text of several lines and one
  with a `<style>`, and the client hydrates them in the browser without adding,
  replacing or changing a node.

The tarball tests install the packed package in a new app. They check that it
carries the license, publishes no test, ships every target of its `exports`,
keeps build tools out of its dependencies and loads in plain Node, and that the
app types the icon imports and gets a type error for a typo in a named import.

The installed application scenarios of `@evertondgn/solid-tooling` install this
tarball too and build fixture apps that declare an icon folder: 14 application
cases passed in the same job, as the
[tooling README](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/README.md#how-it-is-tested)
describes.

## Known limits

- A folder in `collections` that cannot be read, an `@iconify-json/<collection>`
  that the `package.json` lists but that is not installed, and a declaration
  file that cannot be written do not stop the dev server or the build. The
  plugin logs a warning with the folder, the collection or the file and the
  error code, and only an import that needs the missing icons fails. The
  declaration file leaves out the collection that cannot be read and keeps the
  others; a file that cannot be written keeps its last content. `writeIconTypes`
  writes the same file and returns the warnings, and `checkIconTypes` fails on
  them.
- The declaration file is written to a temporary file next to it and renamed, so
  a type check that reads it while the dev server or a build writes it reads a
  whole file.
- An installed collection is read once per process, and the declaration file
  lists the collections of the `package.json` when the dev server starts. After
  you add or update an `@iconify-json/<collection>` package, stop and start the
  dev server process: the restart of Vite in the same process, as with the `r`
  key, keeps the collection it read.
- An export name or a path names the icon that the installed version of the
  collection has. If a new version of the collection draws another icon under
  the same name, the import draws the new one, without an error.
- The declaration of the imports by path accepts any name, so a typo in a path
  passes the type check and stops the build. The imports by name are checked by
  the type check too.
- The ids inside an SVG, which gradients and clip paths use, are the same in
  every instance of the icon on a page.
- The import forms that have no names to read, such as `import * as Icons`, stop
  the build
  ([what is not supported](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/imports.md#what-is-not-supported-and-why)).

## Reference

The reference ships in this package, in
[`docs/`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/README.md),
so `node_modules/@evertondgn/vite-plugin-solid-icons/docs/` holds the reference
of the version your app installed.

- [Icons plugin reference, by task](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/README.md)
- [Imports](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/imports.md):
  by name, by path, `?raw`, server rendering and the forms the build refuses
- [Collections](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/collections.md):
  installed collections, your own folders and SVG edits without a restart
- [What the plugin does with your SVG files](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/svg-files.md)
- [Names you can predict](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/names.md)
- [Typed names and a suggestion on a typo](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/docs/types.md)

## Versions and license

The package follows semantic versioning. Below 1.0.0, a breaking change raises
the minor version. Each release is listed in the
[changelog](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/CHANGELOG.md).

[MIT](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/LICENSE).
This package is part of
[Solid Base](https://github.com/everton-dgn/solidjs_base/blob/main/README.md),
next to `@evertondgn/solid-tooling` and `@evertondgn/solid-runtime`.
