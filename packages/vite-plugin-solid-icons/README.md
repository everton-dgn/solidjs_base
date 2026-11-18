[![Latest vite-plugin-solid-icons version on npm](https://img.shields.io/npm/v/@evertondgn/vite-plugin-solid-icons)](https://www.npmjs.com/package/@evertondgn/vite-plugin-solid-icons)
[![CI workflow status](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml/badge.svg)](https://github.com/everton-dgn/solidjs_base/actions/workflows/ci.yml)
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

[See it work](#a-typo-in-an-icon-name-stops-the-build) ·
[Who it fits](#who-it-fits) · [Questions](#questions-before-you-adopt-it) ·
[Install](#install) · [Set up](#set-up) · [Update](#update-the-plugin) ·
[Tests](#how-it-is-tested) · [Limits](#requirements-and-limits) ·
[Reference](#reference)

## A typo in an icon name stops the build

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
only at the build ([limits](#requirements-and-limits)).

## Only the icons you import reach the bundle

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

## Who it fits

- You build a SolidJS 2 app on Vite+ and want the icons of an Iconify collection
  or of your own SVG folder as components, without pasting markup.
- Your app is on `@evertondgn/solid-tooling`. `defineSolidApp` already loads
  this plugin, so you install only the `@iconify-json/<collection>` packages
  ([icons in the application config](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/app-config.md#icons)).
- You want a typo in an icon name to fail the type check and the build, with the
  closest name in the message.

## Who it does not fit yet

- Your app uses another bundler or another UI framework. The plugin supports
  only Vite+ and SolidJS 2.
- Your app shows SVG files that users upload. The checks of the plugin do not
  make an untrusted SVG safe, and such a file needs a sanitizer at runtime
  ([what the plugin does with your SVG files](#what-the-plugin-does-with-your-svg-files)).
- You cannot pin exact versions. `vite-plus` 1.7.0 and `@solidjs/web` 2.0.0 are
  exact peers in the
  [`package.json`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/package.json).
- You run Node older than 26.13.1, the `engines.node` floor of the package.
- You build folder collections on Windows and rely on the checks that keep an
  icon inside its folder. Those checks are tested on macOS and Linux
  ([installed collections and your own folders](#installed-collections-and-your-own-folders)).

## Questions before you adopt it

**Do I need `@evertondgn/solid-tooling`?** No. Any Vite+ app with SolidJS 2 can
add the plugin next to its Solid plugin, as [Set up](#set-up) shows. An app on
the tooling does not install it at all ([Install](#install)).

**Is an SVG file safe once it builds?** The build stops on markup that runs code
in a page, such as a `<script>`, an event handler attribute, a `javascript:`
URL, an HTML element or a `<foreignObject>`. The checks do not make an untrusted
SVG safe: they leave external references, such as an `<image>` that points to a
URL, or a CSS `url()`. Review the SVG files of a folder as you review code
([the full list](#what-the-plugin-does-with-your-svg-files)).

**Does it render on the server and hydrate?** Yes. The icon module goes through
the Solid plugin of the app, so a server build and the dev server render it with
`renderToString`. The test
[`hydration.test.ts`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/src/__tests__/hydration.test.ts)
renders two icons in a server build and hydrates them in a browser without
adding, replacing or changing a node.

**What happens when a collection updates?** An import renders whatever the new
version ships under that name, with no error when the drawing changed. A running
dev server keeps the old version until you stop and start it
([limits](#requirements-and-limits)).

**What does it add to the install?** The 0.8.0 tarball has 8 files and 96,451
bytes unpacked, as
`npm view @evertondgn/vite-plugin-solid-icons@0.8.0 dist.fileCount dist.unpackedSize`
reports, and two production dependencies, `@iconify/utils` and `magic-string`.
Each Iconify collection you use is a package of its own. The plugin runs in the
build, so it is a dev dependency.

**Where did this version come from?** Version 0.8.0 carries npm provenance (an
SLSA v1 provenance statement) published by the release workflow through trusted
publishing. The statement names `.github/workflows/release.yml` on
`refs/heads/main` and commit `11626d7`. It shows which commit and workflow built
the tarball, and it says nothing about bugs in the code. Version 0.7.0 was
published by hand and has no statement
([security policy](https://github.com/everton-dgn/solidjs_base/blob/main/SECURITY.md)).
In an app that installed the package, `npm audit signatures` verifies the
registry signatures and attestations of the installed packages.

## Install

Install it as a dev dependency, with one `@iconify-json/<collection>` package
for each Iconify collection the application imports:

```bash
vp add -D @evertondgn/vite-plugin-solid-icons @iconify-json/hugeicons
```

The application provides `vite-plus`, `@solidjs/web` and `@solidjs/vite-plugin`.
Folders of your own SVG files need no package.

Applications built on `@evertondgn/solid-tooling` do not install this package:
`defineSolidApp` already loads it, and they add only the
`@iconify-json/<collection>` packages. See the
[tooling README](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/README.md).

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
[Typed names](#typed-names-and-a-suggestion-on-a-typo). `vp check` type-checks
these imports only when `lint.options` in `vite.config.ts` sets `typeAware` and
`typeCheck` to `true`; the lint preset of `@evertondgn/solid-tooling` sets both.

## Update the plugin

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

In the CI run of the 0.8.0 release pull request, the
[Packages job](https://github.com/everton-dgn/solidjs_base/actions/runs/43975952604/job/133680118978)
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
[tooling README](https://github.com/everton-dgn/solidjs_base/blob/main/packages/solid-tooling/README.md)
describes.

## Requirements and limits

- Node 26.13.1 or later: `engines.node` in the package's `package.json` is
  `>=26.13.1`.
- Vite+ (`vite-plus`) and `@solidjs/web` in the versions of the peer
  dependencies, and `@solidjs/vite-plugin` in the plugins of the application.
  The plugin reads your imports with the parser that `vite-plus` exports.
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

## Reference

[Import by name](#import-icons-by-name) ·
[Import by path](#import-one-icon-by-its-path) · [SVG text](#the-svg-as-text) ·
[Collections](#installed-collections-and-your-own-folders) ·
[SVG files](#what-the-plugin-does-with-your-svg-files) ·
[Names](#names-you-can-predict) ·
[Types](#typed-names-and-a-suggestion-on-a-typo) ·
[Errors](#build-errors-that-name-the-icon) ·
[Dev server](#svg-edits-without-a-restart) ·
[Server rendering](#server-rendering) ·
[Not supported](#what-is-not-supported-and-why) · [Options](#options)

### Import icons by name

```tsx
import { ArrowLeft01 as Back, Github } from 'icon:hugeicons'
import { Logo } from 'icon:brand'

export { Github } from 'icon:hugeicons'
```

Write the names of a collection in one import, rename them with `as` and
re-export them as you would with any module. The plugin rewrites each name into
the import of that one icon before the build, so
`import { Github } from 'icon:hugeicons'` builds the same bundle as
`import Github from 'icon:hugeicons/github'`. The name of each icon follows one
fixed rule, described in [Names you can predict](#names-you-can-predict).

`import type` and `export type` stay as you wrote them. A `type` specifier, as
in `import { type Github, Moon } from 'icon:hugeicons'`, moves to an
`import type` of its own, so it brings no module into the bundle, also with
`verbatimModuleSyntax`.

### Import one icon by its path

```tsx
import IconGithub from 'icon:hugeicons/github'
import IconLogo from 'icon:brand/logo'

export function Header() {
  return (
    <header>
      <IconLogo width="2em" />
      <IconGithub class="social" />
    </header>
  )
}
```

`icon:<collection>/<name>` is the icon under its own file or Iconify name, with
the default import named as you like. The name is written exactly as the file or
the collection writes it: `icon:hugeicons/first-bracket` loads the icon, and
`icon:hugeicons/firstBracket` stops the build, so one icon is one module. Every
icon is reachable this way, including the few that have no export name.
`import('icon:hugeicons/github')` loads one icon when the page needs it.

Each icon is a component that takes the props of an `<svg>` element. The props
are spread after the attributes of the icon, so `width`, `class` or `aria-label`
replace them. Icons render at 1.2 times the font size of their text, with
`width` and `height` in `em`, unless your SVG file already sets its own `width`
and `height`. Each icon is its own module, marked without side effects, so the
build keeps only the icons you import.

### The SVG as text

```ts
import githubSvg from 'icon:hugeicons/github?raw'

export const githubImage = `data:image/svg+xml,${encodeURIComponent(githubSvg)}`
```

Add `?raw` to the path to get the SVG markup as a string, with the same
attributes as the component, `customizeIcon` included. Use it where a component
does not fit: a data URL, a canvas or an email template. Any other query is
refused.

The string is written again from the markup that the file parses to, as the
component is, so a browser reads the same elements as the plugin did:

- It has the elements, attributes and text of the file, with one space between
  the attributes. A value escapes `&`, `<` and `"`, and a text escapes `&`, `<`
  and a `]]>`, also one that the pieces of a text form around a comment or a
  CDATA section, so an XML parser reads the string back.
- Comments, processing instructions, the XML declaration and a DOCTYPE are left
  out.
- A CDATA section becomes escaped text. An `&` in the CSS of a `<style>` is
  written `&amp;`, which a page and an XML parser read back as `&`.

### Installed collections and your own folders

An Iconify collection is any `@iconify-json/<collection>` package the
application installs. Its icons and its aliases are available under the name of
the collection, as in `icon:hugeicons`.

A folder collection is a folder of SVG files that you declare in `collections`,
relative to the Vite root:

```ts
solidIcons({
  collections: {
    brand: './src/assets/icons',
    flags: './src/assets/flags'
  }
})
```

- Every `.svg` file is an icon: `src/assets/icons/logo.svg` is `icon:brand/logo`
  and `Logo`.
- A file name may contain dots, as in `logo.v2.svg`, imported as
  `icon:brand/logo.v2` or by its name, `LogoV2`.
- An import names the file exactly, in the same case, on every file system:
  `icon:brand/Logo` does not load `logo.svg` on macOS either, and the error
  names the file that the folder has.
- A symbolic link to an SVG file is not read, so an icon cannot reach a file
  outside the folder. The error says that the file is a link. The folder itself
  may be a link.
- The plugin keeps the folder that it found when the dev server or the build
  started: its real path, where a folder declared as a link led then, and its
  device and inode. Every read of an icon checks both, so a folder replaced
  after that, or a folder above it, stops the imports of its icons with the
  folder in the error, until you stop and start the dev server. That covers a
  folder replaced by another folder, by a link to another folder, and a folder
  moved away and replaced by a link to it, which keeps its files. A folder
  declared as a link that leads to another folder after the start, and a
  checkout that removes the folder and creates it again, stop the imports too.
- The listing knows a file of the folder by its device and inode, not by its
  path. A file with another identity, as an editor writes when it saves to a new
  file and renames it over the icon, is listed again and read. A hard link reads
  as the regular file it is, on every read: making one takes a write in the
  folder, as a new SVG does, and a file moved over the icon reads the same way.
- So an icon comes from a regular file of the folder that the plugin found
  first, which does not tell where the content of the file came from. Node reads
  a folder by its path, so a folder swapped and put back between two checks is
  not seen. Windows has no flag to open a file without following a link, and the
  identity of a file comes from its file system there: the checks are tested on
  macOS and Linux.
- A file whose name an import cannot spell, as in `my icon.svg` or `ícone.svg`,
  has no import and no export name. The dev server and the build warn once with
  its name.
- A collection name uses lowercase letters, digits and single hyphens. Another
  name stops the configuration with the list of the invalid names.
- A folder declared with the name of an installed collection takes its place.

### What the plugin does with your SVG files

The SVG files of a folder collection are part of your application, as its source
files are: the plugin does not sanitize them, and you review them as you review
code. What the plugin guarantees is that the markup of a file stays markup:

- The component and `?raw` write again the elements, attributes and text that
  the file parses to. No text of the file becomes JavaScript, a JSX expression,
  a component or a DOM property, and Solid escapes the text and the values when
  it renders them. No part of the file that the plugin skips, such as a comment,
  reaches the page, where the HTML parser could end it in another place.
- The text of `<text>` and of the elements inside it, and of `<title>`, `<desc>`
  and `<style>`, keeps its line breaks and spaces in the component, on the
  client and on the server, so it draws as in the file and in `?raw`, also with
  `xml:space="preserve"`. The spaces between the other elements draw nothing and
  stay out of the component.
- The build stops, with the icon and the reason, on markup that runs code in a
  page: a `<script>` element, an event handler attribute such as `onload`, a
  `javascript:` or `vbscript:` URL in any attribute or in an entry of the
  `values` of an animation, and an animation of `href`.
- The build stops on a `data:` URL that a page opens as a document of its own:
  in the `href` or `xlink:href` of an `<a>` or of a `<use>`, and in an `<image>`
  or a `<feImage>` unless it holds an image, a PNG, JPEG, GIF, WebP, AVIF or
  SVG.
- The build stops on markup that a page reads as HTML, where it can run code:
  - an element outside the elements of SVG 2, its filters and its animations,
    such as `<p>`, `<iframe>`, `<img>`, `<embed>` or `<meta>`, at any depth;
  - `<foreignObject>`, which embeds HTML;
  - an element inside `<title>`, `<desc>` or `<style>`, which hold text only: a
    browser reads the content of `<title>` and `<desc>` as HTML;
  - a `<` in the text of `<style>`, written in a CDATA section or as `&lt;`: the
    server writes the text of `<style>` as it is, and a `<` there could end the
    element. A `<` in the text of `<title>` and `<desc>` stays text: the
    component, the server and `?raw` write it escaped.

  These checks apply to the component and to `?raw`, for a folder and for an
  installed collection.

- The build also stops on a `&` before a letter or a `#` in the text of
  `<style>`, written as `&amp;` or in a CDATA section, as in `&amp;quot;`: the
  server writes that text as it is, and a page reads a character reference
  there, so the CSS of the server and of the hydrated page would differ from the
  one of the client and of `?raw`. In a CSS string or URL, the escape `\26 `
  writes a `&`, and a nesting selector such as `&#id` can be written `#id&`. A
  `&` before a space, a digit or punctuation, as in `&:hover`, `& .x` or `&.on`,
  stays as it is. The check applies to the component, to the server and to
  `?raw`.
- The component also refuses the markup that JSX reads as code: the attributes
  `innerHTML`, `textContent`, `innerText`, `children` and `ref`, and the
  namespaces that Solid reads, such as `prop:` and `use:`. `?raw` keeps them as
  text.
- The data that drawing applications write for themselves draws nothing and is
  left out of the component and of `?raw`: `<metadata>`, and the elements and
  attributes of the `sodipodi`, `inkscape`, `rdf`, `cc`, `dc`, `sketch` and
  `serif` namespaces, with their `xmlns:` declarations. The dev server and the
  build warn once per file with what they left out, so a file saved by Inkscape
  compiles as it is.
- A file that is not well-formed XML stops the build with what is wrong in it.
  What comes before the `<svg>` root, such as a DOCTYPE, is left out. The plugin
  reads the five entities of XML and the numeric references only, so an entity
  of a DOCTYPE, such as an external entity, stops the build instead of
  expanding. The Save As of Adobe Illustrator writes its namespaces as such
  entities, as in `xmlns="&ns_svg;"`, and stops with
  `&ns_svg; is not an XML entity`: export the file with Export As, choosing SVG,
  which writes the namespaces as text.
- Comments and processing instructions are left out of the component and of
  `?raw`.

The checks do not make an untrusted SVG safe: they leave external references,
such as an `<image>`, a `<use>` or an `<a>` that points to a URL, or a CSS
`url()`. An SVG that a user uploads needs a sanitizer at runtime, not a folder
collection. The icons of an installed collection go through the same checks.

### Names you can predict

The name of an icon is its file or Iconify name in PascalCase. You read it from
the icon you see in the Iconify catalog or in your folder, without a lookup
table. These are real names of the `hugeicons` collection:

| Icon                                    | Import by name                                     | Import by path                 |
| --------------------------------------- | -------------------------------------------------- | ------------------------------ |
| `github`                                | `Github`                                           | `icon:hugeicons/github`        |
| `arrow-left-01`                         | `ArrowLeft01`                                      | `icon:hugeicons/arrow-left-01` |
| `arrow-down-01`                         | `ArrowDown_01`, because `arrow-down01` also exists | `icon:hugeicons/arrow-down-01` |
| `arrow-down01`                          | none                                               | `icon:hugeicons/arrow-down01`  |
| `3d-move`                               | `Icon3dMove`                                       | `icon:hugeicons/3d-move`       |
| `first-bracket`, alias of `1st-bracket` | `FirstBracket`, next to `Icon1stBracket`           | `icon:hugeicons/first-bracket` |

The rule, in the order the plugin applies it:

1. Split the name at every character that is not a letter or a digit, and write
   each part with a capital first letter: `arrow-left-01` is `ArrowLeft01`, and
   `logo.v2` is `LogoV2`.
2. A name that starts with a digit gets the `Icon` prefix, because an identifier
   cannot start with one: `3d-move` is `Icon3dMove`.
3. When two different icons give the same name, that name is not exported, so it
   never depends on which of the two the plugin reads first. Each of the two
   gets its strict name, which keeps an underscore before a group of digits that
   follows a separator: `arrow-down-01` and `arrow-down01` both give
   `ArrowDown01`, so `arrow-down-01` is `ArrowDown_01`.
4. An icon whose strict name is the same as the plain one, as `arrow-down01`, or
   whose strict name another icon also claims, keeps only its import by path.
5. An alias of an Iconify collection gets a name by the same rule and loads the
   same module as its icon, so an alias and its own icon never collide. An alias
   whose name matches a different icon is a collision, as in step 3. An alias
   that flips or rotates its icon is an icon of its own, and so is an alias of
   an icon whose name no import can spell.
6. A name gets an export only when its icon loads: an icon of `icons.json`
   without a body, an alias that is not an object and an alias that leads to no
   icon with a body have none, and an icon wins over an alias of its name, also
   where another alias points to that name.

The result does not depend on the order of the icons in the collection. A strict
name always has an underscore, which no plain name has, so it never takes the
name of another icon.

Version 1.2.36 of `@iconify-json/hugeicons`, the one the tests of the package
install, has 6,140 icons and 26 aliases, which give 6,149 export names in the
declaration file that the plugin wrote on 2026-11-17. Fourteen icons have no
export name and keep their import by path: `arrow-down01`, `arrow-down10`,
`arrow-up01`, `arrow-up10`, `axis3d`, `book-up2`, `circle-slash2`,
`file-axis3d`, `folder-git2`, `rotate3d`, `rows2`, `rows3`, `rows4` and
`scale3d`.

Ten of those names are also globals of the browser or of JavaScript:
`Clipboard`, `Function`, `Gamepad`, `History`, `Lock`, `Map`, `Math`,
`Navigation`, `Option` and `Text`. Importing one under its own name hides the
global in that module, so that module can no longer reach the global `Map`.
Rename it on import:

```ts
import { Map as MapIcon } from 'icon:hugeicons'
```

### Typed names and a suggestion on a typo

The dev server and the build write a declaration file with one
`declare module 'icon:<collection>'` for each `@iconify-json/<collection>` in
the `package.json` of the application and for each folder collection. Each name
is a typed export, with the path of the icon it loads as its documentation:

```ts
declare module 'icon:hugeicons' {
  import type { IconComponent } from '@evertondgn/vite-plugin-solid-icons/types'

  /** icon:hugeicons/github */
  export const Github: IconComponent
}
```

TypeScript checks every import by name against those exports, so a name that is
not an icon is a type error with the closest name:

```text
typo.ts(1,10): error TS2724: '"icon:hugeicons"' has no exported member named 'Githb'. Did you mean 'Github'?
```

The file is rewritten only when the icons change, so the editor and the file
watchers do not read it again for nothing. For `hugeicons` 1.2.36 alone it
declares 6,149 names, counted in
[Names you can predict](#names-you-can-predict). It is generated: keep it out of
your formatter and linter, as you would any generated declaration.

Set `typesFile` to write it somewhere else, relative to the Vite root, or to
`false` to write none.

#### Write or check the file in CI

The editor needs the file before the first dev server runs, and a type check in
the CI runs without one. Two functions write and check the same file, with the
options of the plugin:

```ts
import { checkIconTypes, writeIconTypes } from '@evertondgn/vite-plugin-solid-icons'

const collections = { brand: './src/assets/icons' }

// Writes the file; isChanged says whether its content changed.
const { file, isChanged } = await writeIconTypes({ collections })

// Fails when the file is missing or differs from the icons.
await checkIconTypes({ collections })
```

Both take `root`, the folder of the application, which is the current folder by
default, `collections` and `typesFile`. When the file is behind the icons,
`checkIconTypes` fails with:

```text
src/icon-collections.d.ts is out of date with the icon collections: write it again with writeIconTypes, the dev server or the build.
```

If you commit the file, run `checkIconTypes` before the build in the CI: the dev
server and the build write the file again, so a check that runs after them
always passes. If you do not commit it, call `writeIconTypes` before the type
check.

### Build errors that name the icon

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
read a file outside the folder of its collection.

### SVG edits without a restart

The dev server follows the files of every folder collection:

- Editing an SVG file updates the icon on the page without a reload.
- Adding a file makes its icon available. An import that failed because the file
  was missing loads once the file exists.
- Removing a file shows the error of the missing icon in the error overlay.
- Renaming a file changes the names of its collection: `moon.svg` renamed to
  `moon-2.svg` turns `Moon` into `Moon2`, the import of `Moon` shows
  `"Moon" is not an icon of 'icon:brand'. Did you mean Moon2?`, and the
  declaration file follows.

Adding, removing and renaming reload the page, because a page whose import
failed cannot apply a hot update.

A build with `--watch` follows the same folders: a file added, removed or
renamed changes the names of its collection and the declaration file, and the
next build reads them.

### Server rendering

The icon module goes through the Solid plugin of the application as a TSX file,
so the Solid compiler you install writes both the DOM output and the server
output. The icons render to a string with `renderToString` in a server build and
in the dev server.

### What is not supported, and why

The plugin reads the names you import while it builds, and turns each one into
the import of one icon. The forms below have no names to read, so they would
need a module with every icon of the collection; the build stops on them and
shows the imports to use:

| Form                                      | Message                                                                                                                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import * as Icons from 'icon:hugeicons'` | `A namespace import of 'icon:hugeicons' is not supported. Import the icons by name, as in import { <Name> } from 'icon:hugeicons', or each icon by its path, as in import <Name> from 'icon:hugeicons/<name>'.` |
| `import Icons from 'icon:hugeicons'`      | `A default import of 'icon:hugeicons' is not supported.`, followed by the same two imports                                                                                                                      |
| `export * from 'icon:hugeicons'`          | `export * from 'icon:hugeicons' is not supported.`, followed by the same two imports                                                                                                                            |
| `import 'icon:hugeicons'`                 | `import 'icon:hugeicons' is not supported: a collection of icons is not a module.`, followed by the same two imports                                                                                            |
| `import('icon:hugeicons')`                | `import('icon:hugeicons') is not supported: load one icon by its path, as in import('icon:hugeicons/<name>').`                                                                                                  |

The imports by name are rewritten in the `.js`, `.ts`, `.jsx` and `.tsx` files
of the application, `.mjs`, `.cjs`, `.mts` and `.cts` included, outside
`node_modules`. Another type of file, such as `.mdx`, a package in
`node_modules`, published as source or linked from a workspace, and a file with
a syntax error are not rewritten. The build then stops with the file that
imported, as in `import 'icon:hugeicons' in src/page.mdx is not supported`, and
the import by path works there.

The plugin supports only Vite+ and SolidJS 2. Other bundlers and other UI
frameworks are out of its scope.

### Options

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

| Entry point                                        | Content                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `@evertondgn/vite-plugin-solid-icons`              | `solidIcons`, `writeIconTypes`, `checkIconTypes` and the types of their options       |
| `@evertondgn/vite-plugin-solid-icons/types`        | `IconComponent`, the type of an icon, without the types of Vite                       |
| `@evertondgn/vite-plugin-solid-icons/icon-modules` | The declarations of the imports by path and of `?raw`, for `types` in `tsconfig.json` |

## Versions and license

The package follows semantic versioning. Below 1.0.0, a breaking change raises
the minor version. Each release is listed in the
[changelog](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/CHANGELOG.md).

[MIT](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/LICENSE).
This package is part of
[Solid Base](https://github.com/everton-dgn/solidjs_base/blob/main/README.md),
next to `@evertondgn/solid-tooling` and `@evertondgn/solid-runtime`.
