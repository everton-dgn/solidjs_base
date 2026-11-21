# @evertondgn/create-solid

Start the questionnaire in your terminal after the first registry release:

```sh
bunx @evertondgn/create-solid@latest
```

```text
┌  Solid Base v0.10.0
│  Start a Solid 2 application with Vite+, TypeScript and tests set up.
│
◇  Project directory
│  solid-app
│
◇  Application title
│  solid-app
│
◇  Rendering mode
│  Server (SSR)
│
◇  Setup
│  Recommended
```

The recommended setup enables all features supported by your rendering mode,
initializes Git and installs dependencies with Bun. Choose Customize to select
features, languages and an installer. Review the summary before confirming. See
the [full terminal session](docs/installation.md#terminal-questionnaire).

Use `--yes` to accept the defaults and skip confirmation. With redirected stdin,
an active `CI` value or `--no-interactive`, provide a destination or use
`--yes`. Invalid settings exit with status 2 before writing.

Use `--pm bun|pnpm|npm` to choose the installer. Bun is required to run the
application tasks for all three managers. See
[installation](docs/installation.md).

Pass `--no-fonts` to use system fonts or `--no-diagnostics` to omit the Solid
reactivity diagnostics package and its development endpoint. Use `--fonts` and
`--diagnostics` to select those defaults explicitly.

Use macOS or Linux. Pass `--title "My application"` to set the display title.
The default title is the last component of the resolved destination path.

With SEO enabled, set the public origin with
`--site-url https://your-domain.example`. The default is `https://example.com`.
The generator rejects `--site-url` when SEO is disabled.

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

Use `--no-git` to skip repository initialization and `--no-install` to generate
files without installing dependencies.
