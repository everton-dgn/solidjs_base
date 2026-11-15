# Application fonts

`defineSolidApp` accepts an optional `fonts` array in SSR and client-only
applications. The application owns the font files and their licenses. The
packages ship no font and generate no font assets when the option is absent or
empty.

```ts
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'
import { SECURITY_HEADERS } from './src/middleware/securityHeaders/constants.ts'

export default defineSolidApp({
  root: import.meta.dirname,
  securityHeaders: SECURITY_HEADERS,
  fonts: [{
    family: 'Example Sans',
    files: [{
      path: 'src/assets/fonts/example-latin.woff2',
      weight: '100 900',
      style: 'normal',
      unicodeRange: 'U+0000-00FF',
      preload: true
    }]
  }]
})
```

The array contains only data. Each family has `family` and `files`. Each file
has a required `path`, relative to the application root, and these optional
descriptors:

| Field          | Default        | Accepted values                                                                          |
| -------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `weight`       | `normal`       | A number from 1 to 1000, a numeric string, a range such as `100 900`, `normal` or `bold` |
| `style`        | `normal`       | `normal`, `italic` or `oblique`                                                          |
| `display`      | `swap`         | `auto`, `block`, `swap`, `fallback` or `optional`                                        |
| `unicodeRange` | All characters | A CSS Unicode range list                                                                 |
| `preload`      | `false`        | Whether to preload this file                                                             |

Supported file extensions are `.woff2`, `.woff`, `.ttf` and `.otf`. Queries,
fragments, absolute file paths and paths escaping the root, including symlinks,
are rejected. Functions, unknown descriptor keys and malformed CSS descriptor
values are rejected. The exported `FontFamily` and `FontFile` types are
available from `@evertondgn/solid-tooling/vite`.

## SSR documents

Render `FontLinks` once inside the document's head, in the same tree on the
server and client:

```tsx
import { FontLinks } from '@evertondgn/solid-runtime/fonts/font-links'
import type { ParentProps } from 'solid-js'

export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <FontLinks />
      </head>
      <body>{props.children}</body>
    </html>
  )
}
```

Keep the application's hydration and entry scripts alongside these links.
`FontLinks` reads serialized URLs from `virtual:solid-app/fonts`, supplied by
the preset. It renders only an external stylesheet link and the selected font
preloads, with `as="font"`, the matching MIME type and
`crossorigin="anonymous"`. No style element or style attribute is generated. The
existing `style-src 'self'` policy permits this stylesheet.

## Client-only applications

Use the same descriptors with `ssr: false` and omit the SSR options:

```ts
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'

export default defineSolidApp({
  root: import.meta.dirname,
  ssr: false,
  fonts: [{
    family: 'Example Sans',
    files: [{ path: 'src/assets/fonts/example.woff2', preload: true }]
  }]
})
```

The plugin inserts the stylesheet and preloads into `index.html`. This path
needs neither a Document component nor a runtime font import.

Without packaged fonts, omit both the option and the runtime component:

```ts
export default defineSolidApp({ root: import.meta.dirname, ssr: false })
```

## Assets and typography

The plugin emits each distinct font once, even when several descriptors use
identical bytes. A SHA-256 content hash names the assets. The generated CSS and
the preload data use the same absolute URL, including that hash. Fonts are never
inlined, even below Vite's asset size threshold. The generated CSS also has a
content hash and is emitted only in the client output; SSR consumes the same URL
data. Development serves external CSS and font responses, and a font edit
reloads the page.

The default `/` base works without customization. A same-origin absolute
pathname such as `/app/` and a relative `build.assetsDir` are supported.
Relative URL bases and external asset origins are rejected. Generated asset
names are owned by the font plugin; `assetFileNames` does not rename them.

Keep `--font-family`, fallback stacks, weights, sizes and other typography
tokens in application CSS. Add a file descriptor for another subset and copy its
matching `unicodeRange`; select preload only for the subset needed by the
initial page. Remove handwritten `@font-face` declarations and font preloads
when migrating, so another Vite import does not emit the same font again.
