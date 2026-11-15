# Applications with no server

[Tooling reference](README.md)

`ssr: false` builds an application that needs no server at run time: no Nitro,
no server functions and no server bundle. The build is an `index.html` with its
assets, which you can put in places such as:

- a static host: a CDN, a bucket or a GitHub Pages project site under
  `/my-repo/`;
- another backend, such as Rails, Laravel, Go or .NET, that serves the files;
- an app shell, such as Electron, Tauri or Capacitor.

Every step below is opt-in. An application that keeps the base `/` and the
cookie theme builds exactly as before.

## Base path

Set the base with `mergeConfig`, as in
[Changing the result](app-config.md#changing-the-result), or pass `--base` to
`vp build`. A folder base such as `/my-repo/` applies to `vp dev` too; `./` is
for the build only, and `vp dev` serves it from `/`.

| Where the build runs                       | Base        | Router                                                |
| ------------------------------------------ | ----------- | ----------------------------------------------------- |
| The root of a host                         | `/`         | Path history with a fallback to `index.html`, or hash |
| A folder of a host or of another backend   | `/my-repo/` | Hash, or path history with `base` and a fallback      |
| `file://` or a shell that loads the folder | `./`        | Hash                                                  |

```ts
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'
import { defineConfig, mergeConfig } from 'vite-plus'

const app = defineSolidApp({ root: import.meta.dirname, ssr: false })

export default defineConfig(env => mergeConfig(app(env), { base: './' }))
```

Vite keeps `./` only in a client build and turns any other relative value, such
as `../` or `app/`, into an absolute path.

## Routing

Use the hash history of the router. The route lives after `#`, so the host
always serves the same `index.html`, a reload keeps the route and nothing
depends on the folder:

```tsx
import { createRouter, hashHistory } from '@solidjs/router'

const Router = createRouter({ routes, history: hashHistory() })
```

Under `file://`, the default path history cannot work: changing the path of a
`file://` page throws a `SecurityError`. With a folder base over HTTP, path
history needs the base and a host that answers every route with `index.html`,
such as a `404.html` copy on GitHub Pages. The router keeps a trailing slash in
its base, so pass the base without it:

```tsx
const Router = createRouter({
  routes,
  base: import.meta.env.BASE_URL.replace(/\/$/u, '')
})
```

The installed scenario checks the hash history only; test path history in a
folder on your own host.

## Fonts

The [`fonts`](fonts.md) option works with every base above. With `./`, the
generated CSS names each font by its file name, relative to the stylesheet, and
`index.html` links the stylesheet and the preloads as `./assets/...`, so both
resolve to the same file. A relative base with SSR is refused. `FontLinks`
renders links for an SSR document only.

## Theme

A server reads the theme cookie of each request. With no server, and under
`file://`, where a page keeps no cookie, store the choice in `localStorage`.
Share the options between the application and the config:

```ts
// src/theme-options.ts
import type { LocalStorageThemeOptions } from '@evertondgn/solid-runtime/theme/types'

export const themeOptions: LocalStorageThemeOptions = {
  storage: 'local-storage',
  storageKey: 'my-app-theme',
  colors: { light: '#ffffff', dark: '#09090b' },
  defaultTheme: 'system'
}
```

```ts
// src/theme.ts
import { defineTheme } from '@evertondgn/solid-runtime/theme/define-theme'

import { themeOptions } from './theme-options.ts'

export const { createTheme, defaultTheme, themes } = defineTheme(themeOptions)
```

`createTheme` restores, saves and shares the choice between tabs as with the
cookie, but it applies the class after the first render. To paint the first
frame in the stored theme, add a classic script at the start of `<head>`.
`storedThemeScript` returns its code. The entry is plain JavaScript, so the
config imports it from Node:

```ts
// vite.config.ts
import { createHash } from 'node:crypto'

import { storedThemeScript } from '@evertondgn/solid-runtime/theme/stored-theme-script'
import { defineSolidApp } from '@evertondgn/solid-tooling/vite'
import type { Plugin } from 'vite-plus'

import { themeOptions } from './src/theme-options.ts'

// Applies the stored theme before the first paint, from a classic script that
// needs no nonce and runs from file://.
const HASH_LENGTH = 8

function storedTheme(): Plugin {
  const source = storedThemeScript(themeOptions)
  const hash = createHash('sha256')
    .update(source)
    .digest('hex')
    .slice(0, HASH_LENGTH)
  const fileName = `assets/theme-${hash}.js`
  let base = '/'
  return {
    name: 'app:stored-theme',
    configResolved(config) {
      ;({ base } = config)
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source })
    },
    transformIndexHtml: (_html, context) => [
      context.server
        ? { tag: 'script', children: source, injectTo: 'head-prepend' }
        : {
            tag: 'script',
            attrs: { src: `${base}${fileName}` },
            injectTo: 'head-prepend'
          }
    ]
  }
}

export default defineSolidApp({
  root: import.meta.dirname,
  ssr: false,
  extend: () => ({ plugins: [storedTheme()] })
})
```

The build emits the script as `assets/theme-<hash>.js` and loads it from the
base. A same-origin external script needs no nonce, passes a `script-src 'self'`
policy and runs from `file://` even in a plain browser. `vp dev` inlines it
instead. Without this plugin the app still works, but shows the system theme for
a moment when the stored choice differs from it.

## Limits

- The client build loads `<script type="module">`. A shell such as Electron runs
  it from `file://`; a plain browser that opens `index.html` from disk blocks
  it, so the app does not start.
- Translations by URL prefix need a server: the Paraglide URL patterns start at
  the root of the host, and under `file://` the pathname is the path of the
  file. Use one language, or the Paraglide `localStorage` strategy without the
  `url` and `cookie` strategies.
- `createLocalizedNavigate` loads a new document with `location.assign` when
  `shouldLocalize` is `false`, when the locale changes or when the href is
  absolute. That leaves a folder base and fails under `file://`.
  `createLocaleNavigationGuard` does the same on a locale change.
- With path history in a folder, an href such as `/about` passed to
  `createLocalizedNavigate` ignores the base of the router. Use the hash
  history, or write the href with the base.
- Cookies and `localStorage` belong to the origin, not to the folder:
  applications under `user.github.io/a/` and `user.github.io/b/` share both.
  Give each application its own `storageKey` or `cookieName`.
- Under `file://`, Chromium reads the font file a second time instead of reusing
  the preload. The file is local, so only the preload hint is lost.
- SEO, `middleware`, `serverSetup` and server functions need SSR and are refused
  with `ssr: false`.

## What the tests prove

The `client-only / isolated` installed scenario rewrites its installed copy as
shown above, with hash history, the theme in `localStorage` and the plugin of
this guide. It lints and type-checks the config, then builds it twice:

- with the base `/meu-repo/`, served over HTTP from that folder: the app mounts,
  loads its font once through the preload, keeps the hash route across a reload,
  saves the dark choice and applies it with the entry module blocked, so only
  the classic script could have set it;
- with the base `./`, opened from `file://` in Chromium, or Chrome on CI, with
  `--allow-file-access-from-files`: the same checks, and the choice survives a
  relaunch of the browser profile.

That flag lets a plain browser load modules from `file://`, as a shell does. It
approaches a shell and does not replace a test in one. It does not cover a
custom protocol such as `app://`, the context isolation or the session
partitions of Electron, a CSP set by the shell, or the WebKit and Android
WebViews of Tauri and Capacitor. Test the built application in your shell.
