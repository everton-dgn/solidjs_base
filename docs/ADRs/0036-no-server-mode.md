# 0036. Client-only applications run with no server

- Status: Accepted
- Date: 2026-11-15

## Context

`ssr: false` already built an application with no Nitro and no server bundle.
Such a build goes to a static host, often in a folder such as a GitHub Pages
project site, to another backend that serves the files, or to an app shell such
as Electron, Tauri or Capacitor, which loads it from `file://` or a protocol of
its own. Electron is one of these destinations, not the feature.

Two defaults assumed a server. Fonts refused any base other than a same-origin
absolute pathname ([0032](0032-packaged-fonts.md)), because one URL served both
the CSS `url()` and the preload `href`, and an SSR document resolves a relative
`href` against its route. The theme kept the choice only in a cookie
([0024](0024-runtime-theme.md)), the one storage a server reads before
rendering; under `file://` a page keeps no cookie at all. Routing, i18n and
navigation helpers had no guide for this mode, and no test opened a client-only
build in a browser.

## Decision

Fonts accept the base `./` when `ssr` is `false`. The CSS names each font by its
file name, relative to the stylesheet in the same `assetsDir`, and `index.html`
links the stylesheet and the preloads as `./assets/...`. A relative base with
SSR is refused with its own message. Absolute bases produce the same CSS bytes
and file names as before.

The theme options gain a storage. `ThemeOptions`, the cookie form, takes an
optional `storage: 'cookie'`; `LocalStorageThemeOptions` takes
`storage: 'local-storage'` and a `storageKey`; `ThemeConfig` is their union.
`defineTheme` and the storage, channel and primitive modules accept
`ThemeConfig`. In the local form, `readTheme` and `saveTheme` use `localStorage`
with the same null, undefined and `isPersisted` contract, and the tab channel
takes the storage key as its name. The cookie stays the default and is the only
storage a server reads: an SSR application may pass the local storage, but it
then renders the default theme until `createTheme` applies the choice, which the
guide lists as a limit.

A new `theme/stored-theme-script` entry, plain JavaScript with a declaration
file, exports `storedThemeScript`. It returns the code of a classic script that
applies the stored choice before the first paint, and sets a `theme-color` meta
that follows it once the parser adds it. A Node config can import it, which the
TypeScript entries cannot. `applyTheme` moves to a JavaScript file, so that
script and the SSR script serialize the same function. The application emits the
script with a small plugin in `extend`, shown in the
[no-server guide](../tooling/no-server.md); there is still no preset option, as
0024 decided. An external same-origin script needs no nonce and runs from
`file://`.

Routing is documented, not wrapped: the guide recommends the hash history of the
router and lists what needs a server, such as translations by URL prefix and
document navigation of the locale helpers.

## Consequences

The runtime has 64 entries, 11 of them under `theme`. Applications that do not
ask for a relative base or the local storage build and render exactly as before.
The JavaScript files of the runtime carry JSDoc types, and a test compares the
themes and media query that the script repeats with the runtime constants. The
runtime tarball test loads the new entry in plain Node and calls it.

The isolated client-only installed scenario now opens its build in a browser,
which [0021](0021-installed-application-scenarios.md) and 0032 had left to the
copy's end-to-end tests. After the default build and its audits, it rewrites the
installed copy with hash history, the local theme and the guide's plugin, lints
and type-checks it, adds a `theme-color` meta after the place of the theme
script, and builds it with the base `/meu-repo/` and with `./` and the assets
folder `static`. Over HTTP from `/meu-repo/`, the app mounts, reads its font
through the preload once, keeps the hash route across a reload and saves the
theme; a page with the entry module blocked then finds the class, `color-scheme`
and meta color that only the classic script can set. From `file://`, Chromium
runs with `--allow-file-access-from-files`, the flag that lets a plain browser
load modules from disk as a shell does. The app mounts, reads its font beside
the stylesheet, keeps the hash route and saves the theme; after a relaunch of
the profile, the same page with the entry module blocked finds the same three
values. There Chromium reads the font file twice, which the test allows and the
guide lists as a limit. The
[no-server guide](../tooling/no-server.md#what-the-tests-prove) lists each
check. Fast tests keep the guide's plugin equal to the scenario's, and check
that the test server serves nothing outside the build and closes when the
browser does not launch. The no-server part, from the rewrite to the last
browser check, took about 4 seconds of an 18-second case, within its 150-second
budget.

That flag approaches a shell and does not replace one. The test does not cover
custom protocols, context isolation, session partitions, a CSP set by the shell,
or the WebKit and Android WebViews of Tauri and Capacitor; applications test
those in their shell. Path history in a folder is documented but not tested.

`vp run validate` already launched a browser in the runtime browser test
project, with the Chrome of the runner on CI. The installed scenarios now launch
it too, three more times in one case, so a missing or changed Chrome on the
runner also stops the scenarios. Locally, the Chromium of Playwright must be
installed. Nitro stays a dependency of the tooling, as
[0027](0027-packaged-tool-dependencies.md) decided; an SSR application served by
another server is out of scope.
