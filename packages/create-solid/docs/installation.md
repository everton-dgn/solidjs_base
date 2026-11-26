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
CLI erases the question, shows the cursor and stops its own process group. Some
questions stay on the screen instead, as the paragraphs below describe. On `fg`
the question is drawn again below what the shell wrote, or the indicator
returns. The CLI clears the first row of the question alone and the rest from
the row below it. tmux by default moves the screen into its history when a
program clears it from the top left corner (`scroll-on-clear`), so this way it
keeps no copy of a question that starts on the top row of the screen, whether
the question fills the screen or not. At a text question the CLI clears the same
way when Clack itself clears from that corner, as when a key changes the top row
of a question that fills a short screen.

A text question, such as the directory or the title, is never taller than the
screen. When its value does not fit, the question shows the rows of the value
around the row of the cursor, with a row of `...` above and below where rows are
left out, as Clack does for the options of a selection, and keeps its title and
its end row, with the message. The CLI counts the rows as the terminal shows
them: the title and the message wrap on a narrow terminal, a long placeholder
takes rows of its own, and the question ends with an empty row, where Clack
leaves the cursor. On a screen too short for the bar above the title, the title,
one row of the value and the end row, the `...` rows go first, then the bar,
then the rows of the end row from the last one, then the rows of the title from
the last one; the row of the cursor stays. So no row of an open text question
goes to the history, where Clack would leave it as it last wrote it. The message
of a validation error shows only while the question is in error, as in Clack:
the next key takes it out.

Enter and Ctrl+C write the whole value when closing a text question. If the
closed question is taller than the screen, its first rows scroll into the
history. A screen that gets shorter while a text question is open moves the
first rows of the question into the history, as the terminal does with any row,
and Clack draws the question again at the new height below them, so a copy of
those rows stays in the history.

The CLI computes its text questions from the state of the question as Clack
wraps it at the width of the terminal, so no row it draws again comes back old.
On Ctrl+Z, and on a stop from outside while the CLI owns the terminal, it erases
the question, and on `fg` it draws the whole question again from the first
column, at the size the terminal has then, also when the terminal got taller,
shorter or of another width during the stop. On a stop from outside while the
CLI does not own the terminal the question stays as it is, the shell writes
below it, and on `fg` the CLI draws the whole question again below what the
shell wrote.

The selections, the multiple selection and the confirmations are drawn again
from the rows Clack wrote of them, which fit on screens of usual sizes: one of
these questions passes the height of the screen only on a terminal of fewer than
about ten rows, or a few more when its message, an option with a long hint or
its footer wraps on a narrow terminal. The CLI counts that the move up of Clack
stops at the top of the screen, so the rows it records are the rows on the
screen. Such a question taller than the screen stays on the screen on Ctrl+Z and
on any stop from outside, the shell writes below it, and on `fg` the CLI draws
again, below what the shell wrote, the rows of it that were on the screen; its
rows above them stay in the history. When Clack writes it again from the top of
the screen, as when it shrinks, Ctrl+Z, or a stop from outside while the CLI
owns the terminal, erases the rows of it on the screen. The screen can get
taller before, during or after the stop, and Clack then counts on it rows of the
question above the ones the CLI drew, where the shell wrote: when the title was
above the top of the screen before the stop, `fg` can draw the question without
its title, and closing the question, or a key that has Clack write it again from
the top of the screen, such as one that takes out a `...`, has Clack write over
the last rows the shell wrote. When the screen gets shorter during the stop than
one of these questions that Ctrl+Z erased, its rows above the shorter screen are
drawn nowhere. The CLI does not replace the erasures of Clack from the top left
corner at these questions, so tmux with `scroll-on-clear` keeps a copy of the
screen each time Clack writes one of them taller than the screen again from the
top. When every row that changed is above the screen, Clack only moves the
cursor up to the top of the screen: Ctrl+Z, or a stop from outside while the CLI
owns the terminal, moves the cursor back to the end of the question first, but
on a stop from outside while the CLI does not own the terminal the shell writes
over the question. After a stop from outside that something other than a shell
continues, with nothing written in between, the CLI draws one of these questions
again from the column where Clack left the cursor. One of these questions whose
output holds bytes the CLI does not recognize is left as it is on any stop and
is not drawn again on `fg`. A text question whose value holds a control
character, such as the one Ctrl+\ types at it, is erased and drawn again like
any other.

Ctrl+\ during a step shows the cursor and quits.

Ctrl+D at a selection, a multiple selection or a confirmation cancels, whatever
keys came before it, such as `j`, `k`, `h`, `l`, space or a letter. At a text
question Ctrl+D cancels while the value is empty. With text it keeps what
readline does: it deletes the character to the right of the cursor, and at the
end of the value it does nothing, so the question goes on. When Ctrl+D cancels,
the keys read after it in the same read, such as an Enter sent right after it,
never reach the question. The CLI then ends as a cancel, with code 130, the
cancel line and the cursor shown. A Ctrl+D read together with the key that
answered a question, such as `abc`, Enter and Ctrl+D in one read, does what it
would do in a read of its own: a text question already answered counts as empty,
so the CLI cancels as at the next question, and at the confirmation that creates
the project the Ctrl+D does nothing, so `y` or Enter creates the project and `n`
cancels as it does alone.

When nothing in the session can continue a stopped process, as when the CLI is
the command that `docker exec -it` starts, Ctrl+Z does nothing and the question
or the step goes on. A shell opened by such a tool has job control, and there
Ctrl+Z suspends as usual. Under an init process, as with
`docker run -it --init`, Ctrl+Z stops the CLI and the processes it started, and
the init too when it shares the process group of the CLI. Nothing in the
container sends SIGCONT to them, so stop the container from another terminal.

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
Ctrl+\, on Linux the terminal echoes `^\` on the row of the indicator, and bash
writes its `Quit (core dumped)` notice and the command over that row, with its
prompt below them.

The shell only owns the terminal while the CLI is at a question when the stop
comes from outside, such as `kill -TSTP` to the process group: the CLI then
keeps the question and raw mode as they are, because erasing would reach the
prompt of the shell and a change of mode from the background would stop the CLI
again, and it draws the question again below what the shell wrote on `fg`. A
shell that does not restore its own terminal modes when a job stops leaves the
terminal in raw mode until `fg`. The CLI asks the system which process group
owns the terminal, through `/proc` on Linux and `/bin/ps` elsewhere. When the
system does not answer within a quarter of a second, the CLI clears as it did
before it could ask, and under `npx` or `pnpm dlx` that clearing can land on the
prompt of the shell.

Canceling Git or the installation sends SIGINT to that process once and waits
for it to end, so an installer can finish its own cleanup. The rollback of npm
in a large install takes a few seconds on its own. Once the window of a repeated
signal described below has passed with the installer still running, the title of
the step turns into a line that starts with the key and then says that the CLI
waits for the cleanup: "Press Ctrl+C to stop Bun now. Waiting for it to clean
up." It fits a terminal of 80 columns in the three languages with Bun, pnpm and
npm, and a narrower terminal cuts its end, not the key. The line is the same
after any first signal: the CLI cannot tell a SIGINT sent with `kill` from
Ctrl+C, and pressing Ctrl+C stops the installer at once after either. When no
question frame is drawn on a terminal, as in plain output or with stdout in a
pipe such as `create-solid app | tee log`, the CLI writes that line on its own
line of the standard error. A second Ctrl+C, SIGINT or SIGTERM after that window
kills the installer at once, and so does, even inside it, a SIGINT or SIGTERM
that differs from the first signal. A SIGHUP never does, first or later: closing
the terminal asks for no faster stop, and after it nobody can press again. When
nobody presses again, as after the terminal closed or under a supervisor that
sends SIGTERM once, the CLI kills the installer about 8 seconds after the first
signal. Those seconds count only while the CLI runs: a stop with Ctrl+Z during
the cleanup, however long, counts as at most a quarter of a second of them, and
a CLI that the machine runs late takes longer to reach them. The bound leaves a
few seconds more than the rollback of npm takes, and stays below the 10 seconds
after which Docker sends SIGKILL. After the SIGKILL the CLI waits about a second
for the installer to exit. An installer that outlives it, such as one in a wait
on a network disk that stopped answering, stays until that wait ends, and the
CLI ends as a cancel without it. Later signals send no other SIGKILL.

Once the process of a step, Git or the installer, has exited, on success, on
failure or on a cancel, the CLI goes on reading what it wrote, and the long
bound above ends, since the installer is gone. While the output of the CLI holds
bytes that its reader has not taken, the CLI waits for that reader, however slow
it is and however long the CLI was stopped, so a slow reader gets the whole
output of the installer. Once the output takes what comes, the CLI lets go of
the pipes when nothing more came for half a second. A process the installer
started that keeps its pipes open with nothing to write, such as a lifecycle
script that outlives bun, then holds the CLI only that half second. One that
keeps writing holds it until the CLI has read a few MiB after the exit, far more
than the pipes and the buffers hold of the output of the installer, or until the
output has taken data for about 8 seconds of the time the CLI runs, whichever
comes first. A first signal during this wait sends nothing to the installer,
which is gone, and arms no bound: the CLI goes on waiting and then ends as a
cancel. A later signal, after the window of a repeated signal, lets go of the
pipes at once, whether the first came before the exit or during this wait, since
it asks to stop now.

The signal manager of npm (`@npmcli/run-script`) sends the CLI every SIGINT and
SIGTERM that `npx` gets, so a Ctrl+C or a `kill -TERM` to the process group
reaches the CLI twice, about a millisecond apart or less. The CLI ignores the
same SIGINT or SIGTERM when it comes again within a small fraction of a second,
so the installer keeps its own cleanup under `npx`.

When the terminal of an interactive bash closes during the installation, the CLI
and the installer get SIGHUP from the system, on Linux twice less than a
millisecond apart, and the installer gets SIGINT from the CLI. The CLI waits for
its cleanup as it does on Ctrl+C, up to the same bound, and no SIGHUP shortens
that wait. A write of the CLI to the closed terminal fails with `EIO`, and one
to a pipe whose reader ended fails with `EPIPE`. Node opens the output again
after each failure, so every later write, such as each frame of the indicator,
fails the same way. The CLI drops these failures and keeps reading the output of
the installer, whichever write failed first, one of its own such as the waiting
line or one that forwards the installer, so an installer that still writes
during its cleanup never blocks on a full pipe. The CLI goes on with what it was
doing and ends as it would have, with code 130 after a cancel and nothing on its
standard error. Any other failure of a write, such as `EIO` on a file, which is
a failure of the disk, or `ENOSPC` on a full disk, stops the CLI as a signal
does, at a question, in a step or after the summary: during the installation the
installer gets SIGINT and the CLI waits for its cleanup. The CLI then ends with
code 1, one line on the other output that names the output that failed and the
error, and the commands left to run that a cancel lists, on that other output
too. When the other output fails too, the CLI writes nothing more.

When the terminal closes at a question, the input of the CLI ends, with no
SIGHUP before it on macOS or on Linux. The CLI then ends as a cancel, with code
130, whatever error the change of terminal mode of that cancel gives: it fails
with `ENOENT` on macOS and with `EIO` on Linux. An input error with one of these
two codes cancels the same way. Where the terminal still shows output, the CLI
writes the cancel line and shows the cursor. Any other input error stops the CLI
with code 1, the message of the error and the cursor shown.
