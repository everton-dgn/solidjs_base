# Optional theme

[Runtime reference](README.md)

Import `@evertondgn/solid-runtime/theme/define-theme` explicitly and call
`defineTheme` once, as in
[The right theme before hydration](../README.md#the-right-theme-before-hydration).
There is no preset option: theme modules enter the bundle only through that
import.

Read the request cookie with `readTheme(cookieHeader) ?? defaultTheme`. Use an
explicit light/dark preference as the HTML class and `themeColor(theme)` as the
meta color. `themeScript(theme)` returns browser code for a theme the caller has
already chosen: it resolves `system` with `matchMedia` and applies the class and
the colors. When you render it inline under the nonce CSP of the runtime, put
the request nonce on the script element. Keep the `.light` and `.dark`
color-scheme CSS rules in the application. `cookieMaxAge` defaults to one year
(31,536,000 seconds) and `defaultTheme` to `system`. The factory validates
`cookieName` and a given `cookieMaxAge` as a positive integer, or a nonempty
`storageKey`, plus nonempty `colors.light` and `colors.dark` and a given
`defaultTheme`, and copies the configuration. Colors remain application-owned
CSS values; validation does not parse CSS. `readTheme` returns `null` for absent
or invalid preferences and `undefined` for blocked access. `themeColor` uses
light for system during SSR; the script resolves the actual system preference
before hydration.

Call createTheme once per provider tree. It applies choices before persistence,
names its BroadcastChannel after the cookie name, or the storage key of the
local form below, and reconciles focus, pageshow and visibility changes. The
cookie is the default storage and the only one a server can read.

An application with no server, such as a static site, a page served by another
backend or an app shell like Electron, Tauri or Capacitor, can pass
`storage: 'local-storage'` and a `storageKey` instead of `cookieName` and
`cookieMaxAge`. Each file opened by `file://` keeps no cookie, and a static host
never reads one. With that storage, `readTheme` reads `localStorage` and ignores
the cookie header, `createTheme` saves there with the same `isPersisted` check,
and BroadcastChannel uses the storage key. `themeScript` only applies the theme
you pass it, so use `storedThemeScript`, below, to read the stored preference
before the client starts.

```ts
export const { createTheme, defaultTheme, themes } = defineTheme({
  storage: 'local-storage',
  storageKey: 'app-theme',
  colors: { light: '#ffffff', dark: '#09090b' }
})
```

To paint the first frame in the stored theme, `storedThemeScript` from
`@evertondgn/solid-runtime/theme/stored-theme-script` returns the code of a
classic script that reads the same key and applies the class, `color-scheme` and
`theme-color`, with the system preference as fallback. A `theme-color` meta that
follows the script in `<head>` gets the color once the parser adds it. That
entry is plain JavaScript with types, so `vite.config.ts` can import it from
Node. Emit the code as an external file loaded at the start of `<head>`, so it
needs no nonce and runs from `file://`; the
[no-server guide](https://github.com/everton-dgn/solidjs_base/blob/main/docs/tooling/no-server.md)
has a plugin for that.

Separate entries also expose `theme/types`, `theme/is-theme`,
`theme/apply-theme`, `theme/stored-theme-script`, `theme/theme-storage`,
`theme/make-system-theme`, `theme/make-theme-channel`,
`theme/make-broadcast-channel`, `theme/create-theme` and
`theme/create-theme/types`. Storage, theme channel and primitive take
ThemeConfig, which is ThemeOptions for the cookie or LocalStorageThemeOptions,
as their first argument. The factory binds those options for normal application
use.

`makeSystemTheme(receive)` reports the current system theme and each change, and
returns `dispose`. `makeBroadcastChannel({ name, receive })` returns a
connection with `post` and `dispose`, and does nothing where BroadcastChannel is
missing. `theme/types` exports `Theme`, `ResolvedTheme`, `ThemeOptions`,
`LocalStorageThemeOptions`, `ThemeConfig`, `ThemeInput` and `ThemeDefinition`,
and `theme/create-theme/types` exports `ThemeState`, the state of the primitive.

`solid-js` comes from your application.
