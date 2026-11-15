# @evertondgn/vite-plugin-solid-icons

A Vite plugin that turns SVG icons into SolidJS 2 components. The icons come
from the [Iconify](https://iconify.design/) collections installed as
`@iconify-json/<collection>` packages, or from folders of SVG files in the
application.

The plugin only works with Vite (or Vite+) and Solid 2. The component it
generates goes through `@solidjs/vite-plugin`, so the Solid compiler of the
application writes the DOM and the SSR output.

## Install

```sh
bun add -D @evertondgn/vite-plugin-solid-icons @iconify-json/hugeicons
```

The application provides `vite-plus`, `@solidjs/web` and `@solidjs/vite-plugin`.
Install one `@iconify-json/<collection>` package for each Iconify collection the
application imports.

## Set up

Add the plugin next to the Solid plugin:

```ts
import solid from '@solidjs/vite-plugin'
import { solidIcons } from '@evertondgn/vite-plugin-solid-icons'
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

Reference the module declarations in the `tsconfig.json` of the application:

```json
{
  "compilerOptions": {
    "types": ["@evertondgn/vite-plugin-solid-icons/icon-modules"]
  }
}
```

The declarations of the imports by name live in a file that the plugin writes,
`src/icon-collections.d.ts` by default (see [Types](#types)).

## Import an icon

```tsx
import IconGithub from 'icon:hugeicons/github'
import IconLogo from 'icon:brand/logo.v2'
import githubSvg from 'icon:hugeicons/github?raw'

export function Footer() {
  return (
    <footer>
      <IconGithub class="icon" />
      <IconLogo />
      <img src={`data:image/svg+xml,${encodeURIComponent(githubSvg)}`} alt="" />
    </footer>
  )
}
```

- `icon:<collection>/<name>` is a component that takes the props of an `<svg>`
  element. The props are spread on the root element, after the attributes of the
  icon, so `width`, `class` or `aria-label` replace them.
- `icon:<collection>/<name>?raw` is the SVG markup as a string, with the same
  attributes as the component.
- A name may contain dots, as in `logo.v2`, which loads `logo.v2.svg`.
- Icons render at 1.2 times the font size: the plugin writes `width` and
  `height` in `em`, unless the SVG file already sets them.
- Each import is its own module without side effects, so the build keeps only
  the icons the application imports.

## Import icons by name

```tsx
import { ArrowLeft01 as Back, Github } from 'icon:hugeicons'
import { LogoV2 } from 'icon:brand'

export { Github } from 'icon:hugeicons'
```

The plugin rewrites each name into the import of one icon, so
`import { Github } from 'icon:hugeicons'` builds the same bundle as
`import Github from 'icon:hugeicons/github'`. `import type` and `type`
specifiers stay as written.

The name of an icon is its file or Iconify name in PascalCase:

| Icon                                       | Name                                     |
| ------------------------------------------ | ---------------------------------------- |
| `github`                                   | `Github`                                 |
| `arrow-left-01`                            | `ArrowLeft01`                            |
| `logo.v2.svg` in a folder                  | `LogoV2`                                 |
| `3d-move`, which starts with a digit       | `Icon3dMove`                             |
| `first-bracket`, an alias of `1st-bracket` | `FirstBracket`, next to `Icon1stBracket` |

When two different icons would get the same name, as `arrow-down-01` and
`arrow-down01` both give `ArrowDown01`, that name is not exported. Each of the
icons gets its strict name instead, which keeps an underscore before a group of
digits after a separator: `arrow-down-01` is `ArrowDown_01`. An icon whose
strict name is still taken, as `arrow-down01`, is only imported by its path,
`icon:hugeicons/arrow-down01`. An alias of the same SVG is not a collision.

A namespace import, a default import and `import()` of a collection are not
supported: the build stops and shows the imports to use.

## Options

| Option          | Type                                         | Default                       | Description                                                                                                                                                                                                |
| --------------- | -------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collections`   | `Record<string, string>`                     | `{}`                          | Folders of SVG files by collection name, relative to the Vite root. The name uses lowercase letters, digits and single hyphens. A folder takes precedence over an installed collection with the same name. |
| `customizeIcon` | `({ collection, name, attributes }) => void` | none                          | Edits the attributes of the `<svg>` element of every icon, of both collection kinds. It may return a Promise.                                                                                              |
| `typesFile`     | `string \| false`                            | `'src/icon-collections.d.ts'` | The declarations of the imports by name, relative to the Vite root, or `false` to write none.                                                                                                              |

## Types

The dev server and the build write a declaration file with one
`declare module 'icon:<collection>'` for each `@iconify-json/<collection>` in
the `package.json` of the application and for each folder collection, and one
export per icon. The file only changes when the icons change. A name that is not
an icon is a type error with a suggestion (`TS2724`).

The default path sits in `src`, which the `tsconfig.json` of most applications
already includes. To write or check the file outside the dev server and the
build, as in the CI or before the editor first opens the project, call the
functions with the options of the plugin:

```ts
import { checkIconTypes, writeIconTypes } from '@evertondgn/vite-plugin-solid-icons'

await writeIconTypes({ collections: { brand: './src/assets/icons' } })
// Fails when the file is missing or out of date.
await checkIconTypes({ collections: { brand: './src/assets/icons' } })
```

Both take `root`, the folder of the application and the current one by default,
and `typesFile`.

## Development server

Editing an SVG file of a collection folder updates the components that use it
without reloading the page. Adding, removing or renaming a file reloads the
page, so an import that failed loads the new icon, and an import of a removed
file shows the error. The names of the collection and the declaration file
follow the files.

## Errors

The build and the development server stop with the name of what is missing:

- `Icon "brand/moon" not found: the folder "src/assets/icons" of the collection "brand" has no moon.svg.`
- `Icon "hugeicons/no-such-icon" not found in @iconify-json/hugeicons.`
- `Icon collection "mdi" not found: install @iconify-json/mdi or declare "mdi" in the collections option of solidIcons.`
- `"Githb" is not an icon of 'icon:hugeicons'. Did you mean Github?`
- `"ArrowDown01" names more than one icon of 'icon:hugeicons': import ArrowDown_01 for arrow-down-01, or 'icon:hugeicons/arrow-down01' for arrow-down01.`

An import with another query than `?raw`, or with a name that leaves the folder
of the collection, such as `icon:brand/../secret`, is refused.

## Known limits

- The `declare module 'icon:*'` declaration of the imports by path accepts any
  icon name: a typo in a path passes the type check and fails in the build. The
  imports by name are checked.
- The ids of the elements inside an SVG, used by gradients and clip paths, are
  the same in every instance of the icon.
