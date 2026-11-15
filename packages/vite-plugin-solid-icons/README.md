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

> SolidJS 2 is still a release candidate. The package pins its `@solidjs/web`
> and `vite-plus` peer dependencies to the versions it is tested with, listed in
> its
> [`package.json`](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/package.json),
> so plan to update them together until SolidJS 2 is stable.

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
files in the application. Each name becomes the import of one icon, so the
bundle carries these three and nothing else of either collection.

[Install](#install) · [Set up](#set-up) ·
[Import by name](#import-icons-by-name) ·
[Import by path](#import-one-icon-by-its-path) · [SVG text](#the-svg-as-text) ·
[Collections](#installed-collections-and-your-own-folders) ·
[SVG files](#what-the-plugin-does-with-your-svg-files) ·
[Names](#names-you-can-predict) ·
[Types](#typed-names-and-a-suggestion-on-a-typo) ·
[Errors](#build-errors-that-name-the-icon) ·
[Dev server](#svg-edits-without-a-restart) ·
[Server rendering](#server-rendering) ·
[Not supported](#what-is-not-supported-and-why) · [Options](#options) ·
[Requirements and limits](#requirements-and-limits)

## Install

The package is not published on npm yet. Once it is, install it as a dev
dependency, with one `@iconify-json/<collection>` package for each Iconify
collection the application imports:

```bash
vp add -D @evertondgn/vite-plugin-solid-icons @iconify-json/hugeicons
```

The application provides `vite-plus`, `@solidjs/web` and `@solidjs/vite-plugin`.
Folders of your own SVG files need no package.

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
[Typed names](#typed-names-and-a-suggestion-on-a-typo).

## Import icons by name

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

## Import one icon by its path

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

## The SVG as text

```ts
import githubSvg from 'icon:hugeicons/github?raw'

export const githubImage = `data:image/svg+xml,${encodeURIComponent(githubSvg)}`
```

Add `?raw` to the path to get the SVG markup as a string, with the same
attributes as the component, `customizeIcon` included. Use it where a component
does not fit: a data URL, a canvas or an email template. Any other query is
refused.

## Installed collections and your own folders

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
- A file whose name an import cannot spell, as in `my icon.svg` or `ícone.svg`,
  has no import and no export name. The dev server and the build warn once with
  its name.
- A collection name uses lowercase letters, digits and single hyphens. Another
  name stops the configuration with the list of the invalid names.
- A folder declared with the name of an installed collection takes its place.

## What the plugin does with your SVG files

The SVG files of a folder collection are part of your application, as its source
files are: the plugin does not sanitize them, and you review them as you review
code. What the plugin guarantees is that the markup of a file stays markup:

- The component writes again the elements, attributes and text that the file
  parses to, as literals. No text of the file becomes JavaScript, a JSX
  expression, a component or a DOM property, and Solid escapes the text and the
  values when it renders them.
- The build stops, with the icon and the reason, on markup that runs code in a
  page: a `<script>` element, an event handler attribute such as `onload`, a
  `javascript:` or `vbscript:` URL in any attribute or in an entry of the
  `values` of an animation, and an animation of `href`.
- The build stops on markup that a page reads as HTML, where it can run code:
  - an element outside the elements of SVG 2, its filters and its animations,
    such as `<p>`, `<iframe>`, `<img>`, `<embed>` or `<meta>`, at any depth;
  - `<foreignObject>`, which embeds HTML;
  - an element inside `<title>`, `<desc>` or `<style>`, which hold text only: a
    browser reads the content of `<title>` and `<desc>` as HTML;
  - a `<` in the text of `<title>`, `<desc>` or `<style>`, written in a CDATA
    section or as `&lt;`: the server writes the text of `<style>` as it is, and
    a `<` there could end the element.

  These checks apply to the component and to `?raw`, for a folder and for an
  installed collection.

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
- Comments and processing instructions are left out of the component and kept in
  `?raw`.

The checks do not make an untrusted SVG safe: they leave external references,
such as an `<image>` or a `<use>` that points to a URL, or a CSS `url()`. An SVG
that a user uploads needs a sanitizer at runtime, not a folder collection. The
icons of an installed collection go through the same checks.

## Names you can predict

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
   that flips or rotates its icon is an icon of its own.

The result does not depend on the order of the icons in the collection. A strict
name always has an underscore, which no plain name has, so it never takes the
name of another icon.

At this revision, the installed `hugeicons` collection has 6,091 icons and 26
aliases, which give 6,106 export names. Eight icons have no export name and keep
their import by path: `arrow-down01`, `arrow-up01`, `book-up2`, `circle-slash2`,
`folder-git2`, `rows2`, `rows3` and `rows4`.

Ten of those names are also globals of the browser or of JavaScript:
`Clipboard`, `Function`, `Gamepad`, `History`, `Lock`, `Map`, `Math`,
`Navigation`, `Option` and `Text`. Importing one under its own name hides the
global in that module, so that module can no longer reach the global `Map`.
Rename it on import:

```ts
import { Map as MapIcon } from 'icon:hugeicons'
```

## Typed names and a suggestion on a typo

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
watchers do not read it again for nothing. For `hugeicons` alone it declares
6,106 names. It is generated: keep it out of your formatter and linter, as you
would any generated declaration.

Set `typesFile` to write it somewhere else, relative to the Vite root, or to
`false` to write none.

### Write or check the file in the CI

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

## Build errors that name the icon

A missing icon stops the build and the dev server with the name you wrote and,
for an import by name, the line and column of that name in your file. These are
the real messages:

| Import                                         | Message                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import { Githb } from 'icon:hugeicons'`       | `"Githb" is not an icon of 'icon:hugeicons'. Did you mean Github?`                                                                                      |
| `import { ArrowDown01 } from 'icon:hugeicons'` | `"ArrowDown01" names more than one icon of 'icon:hugeicons': import ArrowDown_01 for arrow-down-01, or 'icon:hugeicons/arrow-down01' for arrow-down01.` |
| `import X from 'icon:hugeicons/no-such-icon'`  | `Icon "hugeicons/no-such-icon" not found in @iconify-json/hugeicons.`                                                                                   |
| `import X from 'icon:brand/moon'`              | `Icon "brand/moon" not found: the folder "src/assets/icons" of the collection "brand" has no moon.svg.`                                                 |
| `import X from 'icon:mdi/home'`                | `Icon collection "mdi" not found: install @iconify-json/mdi or declare "mdi" in the collections option of solidIcons.`                                  |
| `import X from 'icon:hugeicons/github?url'`    | `Unsupported query in the icon import "icon:hugeicons/github?url": only ?raw is accepted.`                                                              |
| `import X from 'icon:brand/../secret'`         | `Invalid icon import "icon:brand/../secret". Import an icon as 'icon:<collection>/<name>', or 'icon:<collection>/<name>?raw' for the SVG text.`         |

The suggestion is the closest name within three edits, ignoring case. A name can
only use letters, digits, `_`, `-` and dots between them, so an import cannot
read a file outside the folder of its collection.

## SVG edits without a restart

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

## Server rendering

The icon module goes through the Solid plugin of the application as a TSX file,
so the Solid compiler you install writes both the DOM output and the server
output. The icons render to a string with `renderToString` in a server build and
and in the dev server.

## What is not supported, and why

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

## Options

| Option          | Type                                         | Default                       | Description                                                                                                     |
| --------------- | -------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `collections`   | `Record<string, string>`                     | `{}`                          | Folders of SVG files by collection name, relative to the Vite root                                              |
| `customizeIcon` | `({ collection, name, attributes }) => void` | none                          | Edits the attributes of the `<svg>` element of every icon, of both kinds of collection; it may return a Promise |
| `typesFile`     | `string \| false`                            | `'src/icon-collections.d.ts'` | The declaration file of the names, relative to the Vite root, or `false` to write none                          |

`customizeIcon` receives the name of the collection, the name of the icon and
the attributes as an object of strings, which it edits in place. A value is
text: the plugin escapes `&`, `"`, `<` and `>` in the values it sets, so write
them as they are. A name that is not an attribute name, or a value that is not a
string, stops the build with the icon and the attribute, and an event handler is
refused as in a file:

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

## Requirements and limits

- Vite+ (`vite-plus`) and `@solidjs/web` in the versions of the peer
  dependencies, and `@solidjs/vite-plugin` in the plugins of the application.
  The plugin reads your imports with the parser that `vite-plus` exports.
- A folder in `collections` that cannot be read, an `@iconify-json/<collection>`
  that the `package.json` lists but that is not installed, and a declaration
  file that cannot be written do not stop the dev server or the build. The
  plugin logs a warning with the folder, the collection or the file and the
  error code, the declaration file keeps its last content, and only an import
  that needs the missing icons fails. `writeIconTypes` and `checkIconTypes` fail
  on the same problems.
- The declaration file is written to a temporary file next to it and renamed, so
  a type check that reads it while the dev server or a build writes it reads a
  whole file.
- An installed collection is read once per process. After you update an
  `@iconify-json/<collection>` package, restart the dev server.
- The declaration of the imports by path accepts any name, so a typo in a path
  passes the type check and stops the build. The imports by name are checked by
  the type check too.
- The ids inside an SVG, which gradients and clip paths use, are the same in
  every instance of the icon on a page.

## License

[MIT](https://github.com/everton-dgn/solidjs_base/blob/main/packages/vite-plugin-solid-icons/LICENSE).
This package is part of
[Solid Base](https://github.com/everton-dgn/solidjs_base/blob/main/README.md),
next to `@evertondgn/solid-tooling` and `@evertondgn/solid-runtime`.
