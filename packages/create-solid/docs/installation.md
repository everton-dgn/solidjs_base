# Installing a generated application

Bun runs application tasks for every installer. Choose the installer with
`--pm bun`, `--pm pnpm` or `--pm npm`. The default is Bun.

With `--fonts` (the default), the application hosts its Inter font files.
`--no-fonts` uses system fonts. With `--diagnostics` (the default), the
development server exposes Solid reactivity diagnostics. Use `--no-diagnostics`
to omit the diagnostics package. The corresponding optional fields on the
generator profile are `hasFonts` and `hasDiagnostics`. The other feature
switches are `hasSeo`, `hasTheme` and `hasIcons`.

Set the application title with `--title "Minha aplicação"` or the API option
`title`. It defaults to the last component of the resolved destination path. The
package name still comes from the directory. Each page publishes its own
translated title, including when SEO is disabled.

The destination must be empty. Use `--no-git` to omit Git initialization or
`--no-install` to install dependencies later. The npm profile uses the upstream
Markdown converter without the Bun and pnpm patch.

For programmatic generation, import `generate` from `@evertondgn/create-solid`.
TypeScript consumers can also import the `Profile` type from the same entry.
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

`siteUrl` is optional. The build prepares the formatted template. Feature
selection copies or edits preformatted files. During installation pnpm can
append settings whose values are known only after dependency resolution. When
pnpm changes its workspace file, the installer runs the application's local
`vp fmt pnpm-workspace.yaml`.

Use `--theme` or `--no-theme` to include or omit the light, dark and system
appearance control. Use `--icons` or `--no-icons` to choose between icon
controls and controls with visible text. Both features are enabled by default.

| Mode                      | Hosting                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--mode server` (default) | Deploy the SSR application to Vercel.                                                                                                                  |
| `--mode static`           | Publish `.output/public` on a file host. Serve directory indexes and localized 404 pages, and set per-page CSP headers from `.output/csp-hashes.json`. |
| `--mode client`           | Publish the Vite `dist` directory. Configure an HTML fallback to `index.html` for direct page URLs. JavaScript renders the application.                |

Use `--locales fr,ja --base-locale ja` to choose languages. Tags must be valid
BCP 47 identifiers. An empty list, duplicates after canonicalization and a base
outside the list are rejected. The first tag is the default base when you pass a
list. Server and static apps otherwise use the template's English, Spanish and
Portuguese catalogs with English as the base. A client app defaults to its base
language alone. Use static mode for multiple languages on a file host.

Pass `--no-i18n` to use local message functions. In that profile,
`--base-locale` selects the language of the messages and the HTML document.
Combining `--no-i18n` with `--locales` is an error.

When a catalog is missing, the generator copies the closest supported language
or falls back to English. For example, `pt-BR` starts from Portuguese and
`es-MX` from Spanish. The generator lists each seeded locale after generation so
you can translate it before publishing.

Static builds prerender the current locales. When enabled, the appearance
control saves the preference in local storage.

Use `--seo` or `--no-seo` to include or omit page metadata, JSON-LD, robots,
sitemaps, the llms text files and Markdown pages together. Server and static
applications enable these by default. Client rendering disables them. Use
`--mode static --seo` to publish searchable pages on a file host.

Set the public origin with `--site-url https://your-domain.example` when SEO is
enabled. With SEO disabled the generator rejects this option. Without a theme
switcher the README omits screenshots that compare the light and dark themes.

The corresponding programmatic properties are `siteUrl`, `mode`, `hasSeo`,
`hasTheme`, `hasIcons`, `hasFonts` and `hasDiagnostics`.
