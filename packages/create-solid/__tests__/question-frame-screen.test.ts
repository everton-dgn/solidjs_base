import assert from 'node:assert/strict'
import { it } from 'node:test'

import { askTitle, openQuestion } from './question-screen.ts'
import { terminalScreen } from './terminal-screen.ts'

// The title question of the CLI on a finite screen, written straight to it by Clack and through the question frame.
const columns = 30
const rows = 6
const backspace = '\u007F'
const eraseLine = '\u0015'
// Nine rows of value at 30 columns, one row less, and two rows and a part of one.
const tallLength = 240
const firstErase = 30
const secondErase = 150
// Four rows of value at 30 columns.
const shortLength = 100
const lastErase = 40
// The keys make the question grow past the screen and shrink, and a title of spaces only is an error, which changes the
// symbol of the title above the top of the screen.
const keys = [
  'x'.repeat(tallLength),
  backspace.repeat(firstErase),
  backspace.repeat(secondErase),
  'x'.repeat(shortLength),
  eraseLine,
  ' '.repeat(shortLength),
  '\r',
  'y',
  backspace.repeat(lastErase),
  'z'
]
// oxlint-disable-next-line no-control-regex
const moveOnly = /^\u001B\[999D(?:\u001B\[\d+A)?$/u
type Run = Awaited<ReturnType<typeof openRun>>
type Mode = { isFramed: boolean; isScrollOnClear: boolean }
async function openRun({ isFramed, isScrollOnClear }: Mode) {
  const display = terminalScreen({ rows, columns, isScrollOnClear })
  const question = await openQuestion({
    screen: { rows, columns },
    ask: askTitle,
    display,
    isFramed
  })
  return { question, display }
}
type Pressing = { runs: Run[]; key: string }
async function pressAll({ runs, key }: Pressing) {
  for (const { question } of runs) {
    question.written.length = 0
    await question.press(key)
  }
}

void it('shows on a finite screen what Clack shows without the question frame, after each key', async () => {
  const direct = await openRun({ isFramed: false, isScrollOnClear: false })
  const cleared = await openRun({ isFramed: false, isScrollOnClear: true })
  const framed = await openRun({ isFramed: true, isScrollOnClear: true })
  const runs = [direct, cleared, framed]
  for (const [index, key] of keys.entries()) {
    const before = framed.display.view().cursor
    await pressAll({ runs, key })
    const round = `key ${index + 1}`
    const [plain, copied, shown] = runs.map(run => run.display.view())
    assert.deepEqual(copied?.screen, plain?.screen, round)
    assert.deepEqual(shown?.screen, plain?.screen, round)
    // tmux with scroll-on-clear copies the screen to its history when Clack erases from the top left corner, and the CLI
    // clears that row alone and the rest from the row below it.
    assert.deepEqual(shown?.history, plain?.history, round)
    // The CLI drops a move up of Clack that nothing follows, so the cursor stays at the end of the question.
    const bytes = direct.question.written.join('')
    const cursor = moveOnly.test(bytes) ? before : plain?.cursor
    assert.deepEqual(
      shown?.cursor,
      cursor,
      `${round}: ${JSON.stringify(bytes)}`
    )
  }
  for (const { question } of runs) await question.close()
})

// The question fills the screen at the stop, so the cursor is on the last row of the screen.
const stopAfter = 2
// A stop from outside while the CLI does not own the terminal holds the question, and here the shell writes nothing, as
// when something other than a shell sends the stop and the continue.
void it('draws again below a held question on a finite screen what Clack shows with no stop', async () => {
  const direct = await openRun({ isFramed: false, isScrollOnClear: false })
  const framed = await openRun({ isFramed: true, isScrollOnClear: false })
  const runs = [direct, framed]
  let atStop = direct.display.view()
  for (const [index, key] of keys.entries()) {
    if (index === stopAfter) {
      atStop = direct.display.view()
      await framed.question.stop('hold')
      const held = framed.display.view()
      // The held question stays and the CLI draws it again from the first column of the row of the cursor, so the rows
      // above that row go to the history. Clack moves to the first column before each render, so the column of the
      // cursor does not count.
      assert.deepEqual(
        { screen: held.screen, history: held.history, row: held.cursor.row },
        {
          screen: atStop.screen,
          history: [
            ...atStop.history,
            ...atStop.screen.slice(0, atStop.cursor.row)
          ],
          row: atStop.cursor.row
        }
      )
    }
    await pressAll({ runs, key })
  }
  for (const { question } of runs) await question.close()
  const [plain, shown] = runs.map(run => run.display.view())
  assert.deepEqual(shown?.screen, plain?.screen)
  assert.deepEqual(shown?.cursor, plain?.cursor)
  // The held question stays and the CLI draws it again from the row of the cursor, so its rows above it go to the history.
  const history = plain?.history ?? []
  assert.deepEqual(shown?.history, [
    ...history.slice(0, atStop.history.length),
    ...atStop.screen.slice(0, atStop.cursor.row),
    ...history.slice(atStop.history.length)
  ])
})
void it('shows after Ctrl+Z and fg on a finite screen what Clack shows with no stop', async () => {
  const direct = await openRun({ isFramed: false, isScrollOnClear: false })
  const framed = await openRun({ isFramed: true, isScrollOnClear: false })
  const runs = [direct, framed]
  for (const [index, key] of keys.entries()) {
    if (index === stopAfter) await framed.question.stop('erase')
    await pressAll({ runs, key })
  }
  for (const { question } of runs) await question.close()
  const [plain, shown] = runs.map(run => run.display.view())
  // Ctrl+Z erases the question and fg draws it again where it was.
  assert.deepEqual(shown, plain)
})
