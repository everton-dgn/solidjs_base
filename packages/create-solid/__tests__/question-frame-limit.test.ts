import assert from 'node:assert/strict'
import { it } from 'node:test'
import { stripVTControlCharacters } from 'node:util'

import {
  askTitle,
  openQuestion,
  titleFrames,
  type Pause
} from './question-screen.ts'
import { terminalScreen } from './terminal-screen.ts'

// The title question of the CLI with a value taller than the screen, on a finite screen, through the question frame.
const screenColumns = 40
const screenRows = 8
const backspace = '\u007F'
const home = '\u001B[H'
const end = '\u001B[F'
const left = '\u001B[D'
const right = '\u001B[C'
// Six rows of value at 40 columns, taller than the screen with the rest of the question.
const longLength = 200
const long = 'x'.repeat(longLength)
const erasedLength = 40
const movedRight = 3
const movedLeft = 2
const label = 'Application title'
type Size = { rows: number; columns: number }
type Opening = Size & { isScrollOnClear?: boolean }
async function openOnScreen({ rows, columns, isScrollOnClear }: Opening) {
  const display = terminalScreen({ rows, columns, isScrollOnClear })
  const question = await openQuestion({
    screen: { rows, columns },
    ask: askTitle,
    display
  })
  return { question, display }
}
// The rows of the question are its title, its end row, its ... rows and the rows of the values of these tests, which no row
// of the tagline above the question starts with.
const valueRow = /^│ {2}(?:x|\.{3}|ab |cde |fghi |[\u3040-\u9FFF])/u
const isQuestionRow = (line: string) =>
  line.includes(label) || line.startsWith('└') || valueRow.test(line)
type Place = 'first' | 'last'
type Step = [string, Place]
type Expected = { keys: string[]; place: Place; columns: number }
// The row of the value that holds the cursor, as the question has it on a screen tall enough for all of it.
async function cursorLine({ keys, place, columns }: Expected) {
  const frames = await titleFrames({ columns, keys })
  // The screen shows no style and no space at the end of a row.
  const lines = stripVTControlCharacters(frames.at(-1) ?? '')
    .split('\n')
    .map(line => line.trimEnd())
  const last = lines.findLastIndex(line => line.startsWith('└'))
  // The rows of the title that wrap on a narrow screen do not start with the bar.
  const value = lines.slice(1, last).filter(line => line.startsWith('│  '))
  return place === 'first' ? value[0] : value.at(-1)
}
type View = ReturnType<ReturnType<typeof terminalScreen>['view']>
type Check = { view: View; line: string | undefined; round: string }
function assertOnScreen({ view, line, round }: Check): void {
  assert.deepEqual(
    view.history.filter(entry => isQuestionRow(entry)),
    [],
    `${round}: history`
  )
  assert.ok(line && view.screen.includes(line), `${round}: ${line}`)
}

void it('keeps a text question with a long value on the screen through typing, Backspace, Home, End and arrows', async () => {
  const { question, display } = await openOnScreen({
    rows: screenRows,
    columns: screenColumns
  })
  const steps: Step[] = [
    [long, 'last'],
    [backspace.repeat(erasedLength), 'last'],
    [home, 'first'],
    [right.repeat(movedRight), 'first'],
    ['y', 'first'],
    [end, 'last'],
    [left.repeat(movedLeft), 'last'],
    ['z', 'last']
  ]
  const keys: string[] = []
  for (const [key, place] of steps) {
    keys.push(key)
    await question.press(key)
    const line = await cursorLine({ keys, place, columns: screenColumns })
    assertOnScreen({ view: display.view(), line, round: JSON.stringify(key) })
  }
  await question.close()
})

void it('keeps a text question with a long value on the screen through a validation error and the next key', async () => {
  const { question, display } = await openOnScreen({
    rows: screenRows,
    columns: screenColumns
  })
  for (const key of [' '.repeat(longLength), '\r', 'y']) {
    await question.press(key)
    const view = display.view()
    assert.deepEqual(
      view.history.filter(entry => isQuestionRow(entry)),
      [],
      JSON.stringify(key)
    )
    assert.ok(
      view.screen.some(line => line.includes(label)),
      JSON.stringify(key)
    )
    assert.ok(
      view.screen.some(line => line.endsWith('█')),
      JSON.stringify(key)
    )
  }
  await question.close()
})

// What the shell writes while the CLI is stopped, and the command it writes on fg.
const notice =
  '\n[1]+  Stopped                 create-solid\n$ fg\ncreate-solid\n'
type Stopping = { pause: Pause; height?: number }
async function stopOnScreen({ pause, height = screenRows }: Stopping) {
  const { question, display } = await openOnScreen({
    rows: screenRows,
    columns: screenColumns
  })
  await question.press(long)
  const drawn = await question.stop(pause, async () => {
    display.write(notice)
    display.resize({ rows: height, columns: screenColumns })
    await question.heighten(height)
  })
  await question.press('y')
  const view = display.view()
  await question.close()
  const line = await cursorLine({
    keys: [long, 'y'],
    place: 'last',
    columns: screenColumns
  })
  return { view, line, drawn }
}
const tallerBy = 4
const shorterBy = 3
const heights = [
  { name: 'the same screen', height: screenRows },
  { name: 'a taller screen', height: screenRows + tallerBy },
  { name: 'a shorter screen', height: screenRows - shorterBy }
]
// The held question and the one the CLI draws again.
const copies = 2
for (const { name, height } of heights) {
  void it(`erases on Ctrl+Z and draws back on fg a text question with a long value, with ${name} during the stop`, async () => {
    const { view, line } = await stopOnScreen({ pause: 'erase', height })
    assertOnScreen({ view, line, round: name })
    const all = [...view.history, ...view.screen]
    assert.equal(all.filter(row => row.includes(label)).length, 1, name)
  })
  // A held question stays on the screen and the shell writes below it, so the CLI draws it again below what the shell wrote.
  void it(`draws again below the shell a text question with a long value held on a stop from outside, with ${name} during the stop`, async () => {
    const { view, line } = await stopOnScreen({ pause: 'hold', height })
    assert.ok(line && view.screen.includes(line), name)
    const all = [...view.history, ...view.screen]
    const titles = all.flatMap((row, index) =>
      row.includes(label) ? [index] : []
    )
    const stopped = all.findIndex(row => row.includes('Stopped'))
    assert.equal(titles.length, copies, name)
    assert.ok((titles[0] ?? 0) < stopped && stopped < (titles[1] ?? 0), name)
    const kept = all.slice(titles[1])
    assert.ok(kept.length <= height, name)
  })
}

void it('keeps a text question on the screen at a narrow width, where its title and its message wrap', async () => {
  const narrow = 12
  const narrowLength = 60
  const { question, display } = await openOnScreen({
    rows: screenRows,
    columns: narrow
  })
  const keys = ['x'.repeat(narrowLength), home]
  for (const [index, key] of keys.entries()) {
    await question.press(key)
    const place = index === 0 ? 'last' : 'first'
    const line = await cursorLine({
      keys: keys.slice(0, index + 1),
      place,
      columns: narrow
    })
    assertOnScreen({ view: display.view(), line, round: JSON.stringify(key) })
  }
  await question.close()
})

const wordRepeats = 20
const wideRepeats = 12
const values = [
  { name: 'words', value: 'ab cde fghi '.repeat(wordRepeats) },
  { name: 'wide characters', value: '日本語のタイトル'.repeat(wideRepeats) }
]
void it('finds the row of the cursor in a value with words and wide characters', async () => {
  for (const { name, value } of values) {
    const { question, display } = await openOnScreen({
      rows: screenRows,
      columns: screenColumns
    })
    const keys: string[] = []
    for (const [key, place] of [
      [value, 'last'],
      [home, 'first'],
      [end, 'last']
    ] as const) {
      keys.push(key)
      await question.press(key)
      const line = await cursorLine({ keys, place, columns: screenColumns })
      assertOnScreen({
        view: display.view(),
        line,
        round: `${name} ${JSON.stringify(key)}`
      })
    }
    await question.close()
  }
})

// On a screen too short for the bar, the title, one row of the value and the end row, the bar goes first, then the end
// row, then the title. A title on the top row of the screen changes on a validation error, and tmux with scroll-on-clear
// keeps no copy of the screen.
const shortScreens = [
  { height: 4, kept: [`◆  ${label}`, 'end'] },
  { height: 3, kept: [`◆  ${label}`] },
  { height: 2, kept: [] }
]
for (const { height, kept } of shortScreens) {
  void it(`keeps the row of the cursor of a text question on a screen of ${height} rows`, async () => {
    const { question, display } = await openOnScreen({
      rows: height,
      columns: screenColumns,
      isScrollOnClear: true
    })
    await question.press(long)
    const { screen, history } = display.view()
    const cursor = await cursorLine({
      keys: [long],
      place: 'last',
      columns: screenColumns
    })
    const expected = [
      ...kept.filter(row => row !== 'end'),
      cursor,
      ...(kept.includes('end') ? ['└'] : []),
      ''
    ]
    assert.deepEqual(screen, expected)
    assert.deepEqual(
      history.filter(entry => isQuestionRow(entry)),
      []
    )
    const spaces = ' '.repeat(erasedLength)
    for (const key of [backspace.repeat(long.length), spaces, '\r', 'y']) {
      await question.press(key)
      assert.deepEqual(
        display.view().history.filter(entry => isQuestionRow(entry)),
        [],
        JSON.stringify(key)
      )
    }
    await question.close()
  })
}
