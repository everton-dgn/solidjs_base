import assert from 'node:assert/strict'
import { it } from 'node:test'

import { openTitle } from './question-screen.ts'

// A terminal that gets taller during a stop.
const columns = 30
const firstRows = 6
const tallerRows = 12
// Eight rows of spaces at 30 columns, which the title question takes for an error: with the two rows of the error the
// question has 13 rows, taller than the first screen, and only its first row is above the taller one.
const spaceCount = 200
const spaces = ' '.repeat(spaceCount)
type Reach = { bytes: string; start: number; top: number }
// Follows the cursor from its row in the rows the flush drew, numbered from 0 at the first of them. A row below 0 is one the
// shell wrote above them; the terminal stops a move up at the top of the screen.
function reach({ bytes, start, top }: Reach) {
  const tokens =
    // oxlint-disable-next-line no-control-regex
    /\u001B\[(?<count>\d*)(?<move>[AB])|\n|\u001B\[[^A-Za-z]*[A-Za-z]|[^\n\u001B]+/gu
  let row = start
  let lowest = row
  const above: string[] = []
  for (const match of bytes.matchAll(tokens)) {
    const { count, move } = match.groups ?? {}
    const amount = count ? Number(count) : 1
    if (move === 'A') row = Math.max(top, row - amount)
    else if (move === 'B') row += amount
    else if (match[0] === '\n') row += 1
    else if (row < 0) above.push(`${row}: ${JSON.stringify(match[0])}`)
    lowest = Math.min(lowest, row)
  }
  return { lowest, above }
}
for (const pause of ['erase', 'hold'] as const) {
  void it(`keeps the writes of Clack on the rows the CLI drew after a stop in which the terminal got taller, when the next key changes the title (${pause === 'erase' ? 'erased' : 'held'})`, async () => {
    const question = await openTitle({ columns, rows: firstRows })
    await question.press(spaces)
    // The error changes the symbol of the title, above the screen.
    await question.press('\r')
    const { flushed } = await question.stop(pause, async () =>
      question.heighten(tallerRows)
    )
    const [drawn = ''] = flushed
    // oxlint-disable-next-line no-control-regex
    const drawnRows = drawn.replace(/\u001B\[\d+A$/u, '').split('\n').length
    // oxlint-disable-next-line no-control-regex
    const back = Number(/\u001B\[(?<up>\d+)A$/u.exec(drawn)?.groups?.up ?? 0)
    question.written.length = 0
    // The key ends the error, so Clack writes the title again, with the cursor at the end of the rows the CLI drew.
    await question.press('y')
    const bytes = question.written.join('')
    await question.close()
    const { lowest, above } = reach({
      bytes,
      start: drawnRows - 1 - back,
      top: drawnRows - tallerRows
    })
    process.stdout.write(
      `${JSON.stringify({ pause, drawnRows, bytes, lowest, above })}\n`
    )
    assert.ok(
      lowest >= 0,
      `Clack moved ${-lowest} rows above the ${drawnRows} rows the CLI drew and wrote there: ${above.join(' | ')}`
    )
  })
}
