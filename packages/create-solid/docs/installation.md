# Installing a generated application

Bun runs application tasks for every installer. Choose the installer with
`--pm bun`, `--pm pnpm` or `--pm npm`. The default is Bun.

With `--fonts` (the default), the application hosts its Inter font files.
`--no-fonts` uses system fonts. With `--diagnostics` (the default), the
development server exposes Solid reactivity diagnostics. Use `--no-diagnostics`
to omit the diagnostics package. The corresponding optional fields on the
generator profile are `fonts` and `diagnostics`.

The destination must be empty. Use `--no-git` to omit Git initialization or
`--no-install` to install dependencies later. The npm profile uses the upstream
Markdown converter without the Bun and pnpm patch.

For programmatic generation, import `generate` from `@evertondgn/create-solid`.
Pass the destination, installer and the two setup switches explicitly:

```js
import { generate } from '@evertondgn/create-solid'

const nextSteps = generate({
  dir: 'my-app',
  pm: 'bun',
  shouldInitGit: true,
  shouldInstall: true,
  siteUrl: 'https://example.com'
})
console.log(nextSteps.join('\n'))
```

`siteUrl` is optional. The build prepares the formatted template. After a pnpm
installation the generator uses the installed application's Vite+ to format the
workspace settings that pnpm may update.

Use `--theme` or `--no-theme` to include or omit the light, dark and system
appearance control. Use `--icons` or `--no-icons` to choose between icon
controls and controls with visible text. Both features are enabled by default.

| Mode                      | Hosting                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--mode server` (default) | Deploy the SSR application to Vercel.                                                                                                                  |
| `--mode static`           | Publish `.output/public` on a file host. Serve directory indexes and localized 404 pages, and set per-page CSP headers from `.output/csp-hashes.json`. |

Static builds prerender the current locales. When enabled, the appearance
control saves the preference in local storage.
