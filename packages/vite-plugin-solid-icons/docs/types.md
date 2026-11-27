# Typed names and a suggestion on a typo

[Icons plugin reference](README.md)

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
watchers do not read it again for nothing. For the `hugeicons` version that the
tests install it declared 6,149 names on 2026-11-17, counted in
[Names you can predict](names.md). It is generated: keep it out of your
formatter and linter, as you would any generated declaration.

Set `typesFile` to write it somewhere else, relative to the Vite root, or to
`false` to write none.

## Write or check the file in CI

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
