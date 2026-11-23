# Installing a generated application

Bun runs application tasks for every installer. Choose the installer with
`--pm bun`, `--pm pnpm` or `--pm npm`. The default is Bun.

## Terminal questionnaire

Start with `bunx @evertondgn/create-solid@latest --lang en`. This session
selects the custom setup, static hosting, two languages and pnpm:

```text
┌  Solid Base
│  Start a Solid 2 application with Vite+, TypeScript and tests set up.
│
◇  Project directory
│  portal
│
◇  Application title
│  Portal
│
◇  Rendering mode
│  Static HTML
│
◇  Setup
│  Customize
│
◇  Features
│  SEO metadata, Light and dark theme switcher, Icons, Solid reactivity
│  diagnostics in development
│
◇  Public site URL
│  https://portal.example
│
◇  Enable translations?
│  Yes
│
◇  Languages, separated by commas
│  en,es
│
◇  Base language
│  en
│
◇  Package manager
│  pnpm
│
◇  Create a Git repository?
│  Yes
│
◇  Install dependencies?
│  No
│
◇  Project summary ────────────────────────────────╮
│                                                  │
│  Project directory: portal                       │
│  Application title: Portal                       │
│  Rendering mode: Static HTML                     │
│  Languages: en (base), es                        │
│  Public site URL: https://portal.example         │
│  Features: SEO, Theme, Icons, Solid diagnostics  │
│  Package manager: pnpm                           │
│  Git: Yes                                        │
│  Installation: No                                │
│                                                  │
├──────────────────────────────────────────────────╯
│
◇  Create the project?
│  Yes
│
◇  Files created
◇  Git repository created
│
◇  Next steps ────────────────────────────╮
│                                         │
│  cd portal                              │
│  pnpm install                           │
│  bun run dev                            │
│  See "Before publishing" in README.md.  │
│                                         │
├─────────────────────────────────────────╯
│
└  Project created.
```

The equivalent command is:

```sh
bunx @evertondgn/create-solid@latest portal --title Portal --mode static \
  --locales en,es --base-locale en --seo --site-url https://portal.example \
  --theme --icons --no-fonts --diagnostics --pm pnpm --git --no-install \
  --lang en --no-interactive
```

The CLI prints the settings before creating files. After confirmation, it groups
the completed steps on consecutive lines. After this session, open `portal`, run
`pnpm install` and `bun run dev`. Bun runs the application tasks. Server mode
targets Vercel. Canceling at a prompt or while creating files removes the
unfinished project and any parent directories created for it. After the files
are published, canceling Git or installation stops that process and keeps the
project. The CLI lists the commands left to run. If Git initialization fails,
installation continues and the next steps include `git init`.

Use `--lang pt-BR`, `--lang en` or `--lang es` for the interface. By default,
the CLI checks `LC_ALL`, `LC_MESSAGES`, `LANG` and the locale returned by
`Intl`, in that order, then uses English. Project languages come from
`--locales` and `--base-locale` or the questionnaire.

`--yes` accepts the defaults printed by `--help`. It creates `solid-app` when
the destination is omitted. Flags can override each default. Without a terminal,
with an active `CI` value (anything except empty, `0` or `false`), or with
`--no-interactive`, give a positional destination or `--name DIR` unless using
`--yes`. Other omitted options use their documented defaults. Invalid or
conflicting answers exit with status 2 before writing. In plain output the
installer inherits a terminal stdout and a terminal stderr. When one of them is
not a terminal, the CLI forwards it as it arrives and supplies a missing final
newline. On a terminal the installer writes directly, so a last line it leaves
without a newline is followed by the next line of the CLI.

## Project options

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

The destination may be new, empty, or contain only `.git`, `.DS_Store` or
`Thumbs.db`. Use `--no-git` to omit Git initialization or `--no-install` to
install dependencies later. The npm profile uses the upstream Markdown converter
without the Bun and pnpm patch.

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
selection copies or edits preformatted files. The formatter ignores the
workspace settings that pnpm rewrites during installation.

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
Portuguese catalogs with the questionnaire language as the base. A client app
defaults to its base language alone. Use static mode for multiple languages on a
file host.

Use `--i18n` to enable translations and answer the language questions. Pass
`--no-i18n` to use local message functions. In that profile, `--base-locale`
selects the language of the messages and the HTML document. Combining
`--no-i18n` with `--locales` is an error.

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

During a step, the CLI disables automatic wrapping while drawing the indicator.
Resizing clears the indicator from its first column down, preserving the
completed steps above it. The cursor is hidden during an interactive step and
restored when it ends. A long directory stays on its own line in resume
instructions and destination errors.

Ctrl+Z during a question or a step shows the cursor and lets the shell suspend
the CLI. On `fg` the question is drawn again below what the shell wrote, or the
indicator returns. Ctrl+\ during a step shows the cursor and quits. When the CLI
is the command that `ssh -t`, `docker exec -it` or `docker run -it` without
`--init` starts, nothing in the session can continue a stopped process, so
Ctrl+Z does nothing and the question or the step goes on. A shell opened by
those tools has job control, and there Ctrl+Z suspends as usual. Under an init
process, as with `docker run -it --init`, Ctrl+Z stops the CLI until something
sends SIGCONT to its process group, which nothing in the container does, so stop
the container from another terminal. When a launcher such as `npx` or `pnpm dlx`
runs the CLI, the shell takes the terminal back as soon as the launcher stops. A
step that is still busy stops a moment later, and the CLI may draw its indicator
on the line of the shell prompt and clear that line before it stops.
