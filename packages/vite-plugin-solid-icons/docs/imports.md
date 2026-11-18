# Imports

[Icons plugin reference](README.md)

The plugin turns each import of an icon into the import of one module.

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
fixed rule, described in [Names you can predict](names.md).

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

## Server rendering

The icon module goes through the Solid plugin of the application as a TSX file,
so the Solid compiler you install writes both the DOM output and the server
output. The icons render to a string with `renderToString` in a server build and
in the dev server.

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
