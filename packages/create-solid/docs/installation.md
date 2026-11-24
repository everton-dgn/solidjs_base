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
newline. The two outputs reach the CLI through separate pipes, so when both
outputs of the CLI go to the same file, as with `2>&1`, the lines the installer
writes to stdout and to stderr may not keep their order. On a terminal the
installer writes directly, so a last line it leaves without a newline is
followed by the next line of the CLI. When Ctrl+C cancels plain output and
stderr is a terminal, the closing lines start on a new line, so the `^C` that
the terminal echoes stays on a line of its own. A SIGINT sent with `kill` has no
echo, and that line stays empty: Node does not tell the CLI whether the terminal
echoes control characters.

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
completed steps above it. When the CLI cannot read the size of the terminal
itself, the indicator takes the width that Node reads on the resize. The cursor
is hidden during an interactive step and restored when it ends. A long directory
gets lines of its own in resume instructions, in the project summary and in
destination errors, and keeps every character.

A question is drawn again by Clack when the terminal is resized, with a known
limit when it gets narrower. Clack moves the cursor up by the height the old
frame has at the new width. tmux moves the lines its reflow adds above the
cursor into the history, where no cursor movement reaches them, so the redraw
starts as many lines too low as went into the history, and the first part of an
old line stays above the question. A terminal that cuts long lines instead of
reflowing them loses the heading of the question instead.

Ctrl+Z during a step shows the cursor and lets the shell suspend the CLI. During
a question the terminal is in raw mode, so Ctrl+Z reaches the CLI as a key: the
CLI erases the question, shows the cursor and stops its own process group. On
`fg` the question is drawn again below what the shell wrote, or the indicator
returns. The CLI clears the first row of the question alone and the rest from
the row below it. tmux by default moves the screen into its history when a
program clears it from the top left corner (`scroll-on-clear`), so this way it
keeps no copy of a question that starts on the top row of the screen, whether
the question fills the screen or not. It still keeps a copy of each screen that
Clack clears from that corner while a question taller than the screen shrinks:
in a tmux session on macOS with `scroll-on-clear` on, deleting part of a long
value left another copy of the title in the history above the notice of the
stop, besides the one left when the question grew past the screen.

Clack writes again only the rows of a question that are on screen, so a row
above the top of the screen can be old, for example the symbol of the title
after a validation error, or a row of the value after an edit in its middle. On
`fg` the CLI draws a question taller than the screen again only from the first
row that has stayed on screen through every render of Clack since the question
grew past it, at most as many rows as the screen had when Clack last wrote, and
no more rows than the screen has now. Clack keeps those rows right, and a row
that went above the top of the screen stays old even after the terminal gets
taller. Such a question stays on screen on Ctrl+Z while the CLI cannot reach
rows of it above the top of the screen, that is when it grew past the screen and
Clack has not written it again from the top of the screen since, so its rows
above those drawn again stay in the history above what the shell wrote. When the
terminal gets taller during the stop, Clack counts more rows of the question on
screen than the CLI drew on `fg`, so the next key that changes a row above them,
such as the symbol of the title after a validation error, has Clack move up into
the rows the shell wrote and write there: in a tmux session on macOS the title
landed on the last row of the `fg` echo. When Clack writes the question again
from the top of the screen, as when it shrinks or the terminal gets wider,
Ctrl+Z erases the rows on screen. When every row that changed is above the
screen, as after a key that clears a validation error, Clack leaves the cursor
at the top of the screen. On Ctrl+Z, or on a stop from outside while the CLI
owns the terminal, the CLI moves the cursor back to the end of the question
before the stop, so that the shell writes below it. On a stop from outside while
the CLI does not own the terminal it writes nothing, so the shell writes over
the question: in a tmux session on macOS under `bash -c`, bash wrote its notice
of the stop on the top row. A question that fits on the screen, or shrinks until
it fits, is erased like any other, and on `fg` the CLI draws it again with no
more rows than the screen has now: when the screen got shorter than the question
during the stop, the rows above the ones drawn, the title among them, are drawn
nowhere, because Ctrl+Z erased them from the screen and they never reached the
history. A resize to another width while the CLI is stopped draws the question
at the new width on `fg`. A question whose output holds bytes the CLI does not
recognize is left as it is on Ctrl+Z and is not drawn again on `fg`.

Ctrl+\ during a step shows the cursor and quits.

Ctrl+D at a question ends the input of readline while its line is empty. At a
text question that line is the value. At a selection or a confirmation it is a
line that the question does not show, which a printable key fills, so there
Ctrl+D ends the input only while that line is empty. The CLI then ends as a
cancel, with code 130, the cancel line and the cursor shown. With text in that
line, Ctrl+D deletes the character to the right of the cursor, and at the end of
the value it does nothing, so the question goes on. This was measured on macOS
in the questionnaire harness and on Linux in the CI.

When nothing in the session can continue a stopped process, as when the CLI is
the command that `docker exec -it` starts, Ctrl+Z does nothing and the question
or the step goes on. A shell opened by such a tool has job control, and there
Ctrl+Z suspends as usual. Under an init process, as with
`docker run -it --init`, Ctrl+Z stops the CLI and the processes it started, and
the init too when it shares the process group of the CLI. Nothing in the
container sends SIGCONT to them, so stop the container from another terminal.
These two cases were measured in an `ubuntu:24.04` container on arm64, before
the CLI asked the system which process group owns the terminal. They follow from
what the CLI does now, but were not measured again.

`npx` and `pnpm dlx` stay in the process group of the CLI and stop at once on
Ctrl+Z, so the shell may take the terminal back before the CLI handles its stop.
During a step the CLI then writes only the cursor, which changes no cell, before
it stops: the indicator drawn before the stop stays above what the shell wrote,
and on `fg` the indicator is drawn again below it. `bunx` runs the CLI as the
leader of its own process group, as when Node runs it directly; the shell then
waits for the stop of the CLI, which clears the indicator first. A stop sent
from outside to the CLI alone during a step, such as `kill -TSTP` to its
process, stops its whole process group when the CLI does not own the terminal,
that is when it does not lead the foreground process group, so the shell of the
launcher sees the stop. When the CLI leads the foreground process group, such a
stop stops the CLI alone: the shell reports the job as stopped and takes the
terminal back, the installer goes on during the stop, and `fg` sends SIGCONT to
both. On Ctrl+\ during a step the CLI clears the indicator only when it leads
the foreground process group. Under a launcher in its group that ends at once on
Ctrl+\, on Linux the terminal echoed `^\` on the row of the indicator, and bash
wrote its `Quit (core dumped)` notice and the command over that row, with its
prompt below them.

The shell only owns the terminal while the CLI is at a question when the stop
comes from outside, such as `kill -TSTP` to the process group: the CLI then
keeps the question and raw mode as they are, because erasing would reach the
prompt of the shell and a change of mode from the background would stop the CLI
again, and it draws the question again below what the shell wrote on `fg`. A
shell that does not restore its own terminal modes when a job stops leaves the
terminal in raw mode until `fg`. The CLI asks the system which process group
owns the terminal, through `/proc` on Linux and `/bin/ps` elsewhere. When the
system does not answer within 250 ms, the CLI clears as it did before it could
ask, and under `npx` or `pnpm dlx` that clearing can land on the prompt of the
shell.

Canceling Git or the installation sends SIGINT to that process, which has 750 ms
to end before the CLI kills it, and another SIGINT, SIGTERM or SIGHUP kills it
at once. The signal manager of npm (`@npmcli/run-script`, the same in npm 12.2.3
and 11.20.0) sends the CLI every SIGINT and SIGTERM that `npx` gets, so a Ctrl+C
or a `kill -TERM` to the process group reaches the CLI twice. For Ctrl+C under a
real `npx` the two came about 1 ms apart or less; the SIGTERM case comes from
reading that code and from a test launcher that forwards both signals the same
way, not from a real `npx`. The CLI ignores the same SIGINT or SIGTERM when it
comes again within 150 ms, so the installer keeps its own cleanup under `npx`.
Any other second signal, a second SIGHUP included, and the same one after 150 ms
still kill it at once.

When the terminal of an interactive bash closes during the installation, on
macOS 27 (bash 3.2.57, tmux 3.8) the CLI and an installer of a test with a
cleanup of 200 ms each got one SIGHUP, the installer then got SIGINT from the
CLI, and its cleanup ended, while the CLI ended with code 1 on a write to the
closed terminal (`write EIO`) before its 750 ms were over. On Linux (bash 5.3.9,
tmux 3.6) the CLI got two SIGHUP less than 1 ms apart, and a few milliseconds
after the pane closed it sent the installer SIGINT and, on the second SIGHUP
less than 1 ms later, SIGKILL. The same installer was gone within a few tens of
milliseconds of the pane closing, before it recorded any signal and before its
cleanup ran. The macOS case was measured in the questionnaire harness and the
Linux case in the CI.

When the terminal closes at a question, the input of the CLI ends. On macOS 27
and on Linux no SIGHUP reached the CLI before that. Node used to end the CLI
with code 1, on the change of terminal mode that readline makes when its input
ends, or with code 13, with the question still open. The CLI now ends as a
cancel, with code 130, when the input of a question ends, whatever error the
change of terminal mode of that cancel gives: it failed with `ENOENT` on macOS
and with `EIO` on Linux. An input error with one of these two codes cancels the
same way. Where the terminal still shows output, the CLI writes the cancel line
and shows the cursor. Any other input error stops the CLI with code 1, the
message of the error and the cursor shown. The closed terminal was measured on
macOS in the questionnaire harness and on Linux in the CI.

The process groups of `npx`, `pnpm dlx` and `bunx`, and Ctrl+Z and Ctrl+C under
each of them, were measured on macOS 27 (arm64) with npm 12.2.3 and 11.20.0 (the
`npx` of Node 26.13.1), pnpm 12.23.0 and bun 1.4.5, and not on Linux. A stop
sent from outside to the CLI alone was measured with `bash -c` as the launcher,
and with the CLI leading its group under an interactive bash 3.2.57 on macOS 27.
Ctrl+\ under a launcher was measured in the CI on Linux (bash 5.3.9, tmux 3.6),
with the same screen in every run, with a test launcher that ends on SIGQUIT,
not with a real `npx`, and not on macOS. What this guide says about SIGTERM
under a launcher comes from reading the code of the CLI and of npm.
