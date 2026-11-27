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

The CLI draws the step title at the start and redraws it on resize and after
`fg`. The indicator animates periodically only when the CLI confirms that it
leads the foreground process group. The CLI disables automatic wrapping while
drawing the indicator. Resizing clears the indicator from its first column down
and preserves the completed steps above it. When the CLI cannot read the size of
the terminal itself, the indicator takes the width that Node reads on the
resize. The cursor is hidden during an interactive step and restored when it
ends. A long directory gets lines of its own in resume instructions, in the
project summary and in destination errors, and keeps every character.

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
it stops. The step title stays above what the shell wrote, and on `fg` the CLI
redraws it below the shell's output. `bunx` runs the CLI as the leader of its
own process group, as when Node runs it directly; the shell then waits for the
stop of the CLI, which clears the indicator first. A stop sent from outside to
the CLI alone during a step, such as `kill -TSTP` to its process, stops its
whole process group when the CLI does not own the terminal, that is when it does
not lead the foreground process group, so the shell of the launcher sees the
stop. When the CLI leads the foreground process group, such a stop stops the CLI
alone: the shell reports the job as stopped and takes the terminal back, the
installer goes on during the stop, and `fg` sends SIGCONT to both. On
Ctrl+\ during a step, the CLI clears the indicator only when it leads the
foreground process group. The terminal may echo `^\`. The shell and terminal
determine whether a quit message appears and where it goes.

The shell only owns the terminal while the CLI is at a question when the stop
comes from outside, such as `kill -TSTP` to the process group: the CLI then
keeps the question and raw mode as they are, because erasing would reach the
prompt of the shell and a change of mode from the background would stop the CLI
again, and it draws the question again below what the shell wrote on `fg`. A
shell that does not restore its own terminal modes when a job stops leaves the
terminal in raw mode until `fg`. The CLI checks the foreground process group
through `/proc` on Linux, and through `/bin/ps` elsewhere. The `ps` query has a
250 ms timeout. The Linux read uses no timer. An inconclusive result leaves
periodic animation off. For stop and quit cleanup, the CLI still treats an
inconclusive result as ownership. Under a launcher, that can put the clearing on
the shell prompt.

The CLI sends one SIGINT to the active Git or installer process to start its
cleanup. A Ctrl+C from the terminal can also reach the process independently
through the foreground process group. When the installer is still running after
the 150 ms window for a repeated signal, the CLI can show "Press Ctrl+C to stop
Bun now. Waiting for it to clean up." The line includes the selected package
manager and fits 80 columns in the three languages. A narrower frame truncates
the end of the line and keeps the key visible. Once the line appears, pressing
Ctrl+C forces the installer to stop.

An INT or TERM repeated within 150 ms of the same first signal is absorbed. A
different INT or TERM forces immediately, and a repeated one forces once the
window has elapsed. SIGHUP can start cleanup and never forces. A launcher can
forward INT or TERM close to the original signal, and a terminal closing can
deliver SIGHUP more than once. If an output error started cleanup, the CLI says
"Waiting for Bun to clean up." The first real signal during that cleanup starts
the same window for subsequent signals. The notice uses the interactive frame
when its terminal is available. Otherwise it goes to stderr, or to stdout if
stderr is lost. The CLI omits the notice if both destinations are lost.

With no signal that asks for an earlier stop, the CLI sends SIGKILL after about
eight seconds of execution during cleanup. An elapsed tick counts at most 250
ms, including the tick that spans a pause. A suspension or a busy event loop can
stretch the elapsed wall time. After SIGKILL, the CLI gives the child about a
second to exit, then finishes the cancellation even if the child is still
blocked on a system operation. Later signals send no additional SIGKILL.

The cleanup deadline ends when Git or the installer exits. Any child pipe still
open drains independently. A pipe whose destination is asking for drain and has
queued bytes can wait as long as its reader needs. Git and interactive install
diagnostics use their own pipe without depending on the CLI's stderr queue. Once
a source's destination can accept data, the CLI releases that source after about
half a second without data, or about eight seconds of sampled execution while it
can read. The silence interval starts again after each chunk. The CLI also
releases a source as soon as it reads more than 4 MiB from that source after the
child exits. The chunk that crosses the threshold is forwarded whole.
Descendants can keep writing to a descriptor shared with the installer. A cutoff
can discard bytes still in that source. The other source keeps its own limits
and can deliver its full tail.

A first signal during this drain records cancellation without signaling the
exited child, setting a new cleanup deadline or showing a cleanup notice. A
second eligible INT or TERM releases any remaining child pipes immediately,
whether the first signal came before or after the exit. The CLI still lets bytes
already accepted by a healthy output finish writing. It exits with 130 for
cancellation, or with 1 if an output failure caused the stop.

EPIPE from a closed reader and EIO from a closed TTY are tolerated. The CLI
stops writing to that destination and continues consuming installer output so
the installer can finish. A plain run can still show the wait and cancellation
in stderr after stdout closes. If the other destination also closes, there is
nowhere for a further message to go.

A fatal write error such as EIO on a file or ENOSPC stops the CLI with code 1.
The CLI starts cleanup if a child is still running. On the available alternate
output, the diagnostic names the failed output and the error. At a question, the
CLI stops accepting input, restores the terminal when it can and lets that
diagnostic finish writing. Help and the summary before the project is created
also report just the error. After the project files are created, the diagnostic
includes the directory and commands still needed, including after a failure in
the final instructions or title. A completed installation leaves no reinstall
command. The CLI keeps the project and waits for the final interactive
instructions to finish writing before printing the success title. The cleanup
notice can precede the diagnostic. A pending Ctrl+C echo gets its own line when
the diagnostic goes to a terminal.

When the terminal closes at a question, the input of the CLI ends, with no
SIGHUP before it on macOS or on Linux. The CLI then ends as a cancel, with code
130, whatever error the change of terminal mode of that cancel gives: it fails
with `ENOENT` on macOS and with `EIO` on Linux. An input error with one of these
two codes cancels the same way. Where the terminal still shows output, the CLI
writes the cancel line and shows the cursor. Any other input error stops the CLI
with code 1, the message of the error and the cursor shown.
