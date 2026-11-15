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

Importing a whole collection, as in `import { Github } from 'icon:hugeicons'`,
is not available yet: the build stops with an error that says so.

## Options

| Option          | Type                                         | Default | Description                                                                                                                                                                                                |
| --------------- | -------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collections`   | `Record<string, string>`                     | `{}`    | Folders of SVG files by collection name, relative to the Vite root. The name uses lowercase letters, digits and single hyphens. A folder takes precedence over an installed collection with the same name. |
| `customizeIcon` | `({ collection, name, attributes }) => void` | none    | Edits the attributes of the `<svg>` element of every icon, of both collection kinds. It may return a Promise.                                                                                              |

## Development server

Editing an SVG file of a collection folder updates the components that use it
without reloading the page. Adding or removing a file reloads the page, so an
import that failed loads the new icon, and an import of a removed file shows the
error.

## Errors

The build and the development server stop with the name of what is missing:

- `Icon "brand/moon" not found: the folder "src/assets/icons" of the collection "brand" has no moon.svg.`
- `Icon "hugeicons/no-such-icon" not found in @iconify-json/hugeicons.`
- `Icon collection "mdi" not found: install @iconify-json/mdi or declare "mdi" in the collections option of solidIcons.`

An import with another query than `?raw`, or with a name that leaves the folder
of the collection, such as `icon:brand/../secret`, is refused.

## Known limits

- The `declare module 'icon:*'` declaration accepts any icon name: a typo in a
  name passes the type check and fails in the build.
- The ids of the elements inside an SVG, used by gradients and clip paths, are
  the same in every instance of the icon.
