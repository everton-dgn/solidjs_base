import assert from 'node:assert/strict'
import { it } from 'node:test'

import { terminalScreen } from './terminal-screen.ts'

// Each case is what tmux 3.8 showed in a pane of 20 columns and 6 rows that wrote the same bytes.
const columns = 20
const rows = 6
const lastRow = rows - 1
const full = 'a'.repeat(columns)
const lineCount = 8
const numbered = Array.from(
  { length: lineCount },
  (_, index) => `line${index + 1}`
)
// The rows that went to the history when the numbered lines scrolled a screen of 6 rows.
const scrolled = numbered.slice(0, lineCount - rows)
const lineLength = 'line1'.length
type Step = { bytes?: string; rows?: number }
type Expected = { screen: string[]; history: string[]; cursor: number[] }
type Case = {
  name: string
  steps: Step[]
  expected: Expected
  isScrollOnClear?: boolean
}
const blank = (count: number) => Array.from({ length: count }, () => '')
// The row of the full row once two line feeds came before it, and the rows below the first two.
const fullRow = 2
const belowTwo = rows - fullRow
const shorterRows = 3
// A move up of three rows from the last of six rows leaves the cursor on the third row.
const movedUp = 3
const keptRows = 4
const tallerRows = 9
const edgeRow = 'h  dg'
const cases: Case[] = [
  {
    name: 'wraps a full row only at the next character',
    steps: [{ bytes: full }, { bytes: 'B' }],
    expected: {
      screen: [full, 'B', ...blank(belowTwo)],
      history: [],
      cursor: [1, 1]
    }
  },
  {
    name: 'takes one row for a full row and a line feed',
    steps: [{ bytes: `${full}\nC` }],
    expected: {
      screen: [full, 'C', ...blank(belowTwo)],
      history: [],
      cursor: [1, 1]
    }
  },
  {
    name: 'goes back to the first column of a full row on a carriage return',
    steps: [{ bytes: `${full}\rD` }],
    expected: {
      screen: [`D${full.slice(1)}`, ...blank(rows - 1)],
      history: [],
      cursor: [0, 1]
    }
  },
  {
    name: 'moves up from a full row to its last column',
    steps: [{ bytes: `${'\n'.repeat(fullRow)}${full}\u001B[1AE` }],
    expected: {
      screen: [
        '',
        `${' '.repeat(columns - 1)}E`,
        full,
        ...blank(rows - fullRow - 1)
      ],
      history: [],
      cursor: [fullRow - 1, columns]
    }
  },
  {
    name: 'moves the top rows to the history on a shorter screen with the cursor on its last row',
    steps: [{ bytes: numbered.join('\n') }, { rows: shorterRows }],
    expected: {
      screen: numbered.slice(lineCount - shorterRows),
      history: numbered.slice(0, lineCount - shorterRows),
      cursor: [shorterRows - 1, lineLength]
    }
  },
  {
    name: 'drops the rows below the cursor first on a shorter screen',
    steps: [
      { bytes: `${numbered.slice(0, rows).join('\n')}\u001B[${movedUp}A` },
      { rows: keptRows }
    ],
    expected: {
      screen: numbered.slice(0, keptRows),
      history: [],
      cursor: [lastRow - movedUp, lineLength]
    }
  },
  {
    name: 'takes rows back from the history on a taller screen',
    steps: [{ bytes: numbered.join('\n') }, { rows: tallerRows }],
    expected: {
      screen: [...numbered, ...blank(tallerRows - lineCount)],
      history: [],
      cursor: [lineCount - 1, lineLength]
    }
  },
  {
    name: 'stops moves at the edges of the screen',
    steps: [
      {
        bytes:
          'ab\u001B[9Ac\u001B[9Bd\u001B[99Ce\u001B[999Df\u001B[5Gg\u001B[Gh'
      }
    ],
    expected: {
      screen: [
        'abc',
        ...blank(belowTwo),
        `${edgeRow}${' '.repeat(columns - edgeRow.length - 1)}e`
      ],
      history: [],
      cursor: [lastRow, 1]
    }
  }
]
const top = `\u001B[999D\u001B[${lastRow}A`
for (const isScrollOnClear of [true, false]) {
  const mode = isScrollOnClear ? 'on' : 'off'
  cases.push(
    {
      name: `erases from the top left corner with scroll-on-clear ${mode}`,
      steps: [{ bytes: `${numbered.join('\n')}${top}\u001B[Jnew` }],
      expected: {
        screen: ['new', ...blank(rows - 1)],
        history: isScrollOnClear ? numbered : scrolled,
        cursor: [0, 'new'.length]
      },
      isScrollOnClear
    },
    {
      name: `erases from the top row after its first column with scroll-on-clear ${mode}`,
      steps: [{ bytes: `${numbered.join('\n')}${top}\u001B[3C\u001B[J` }],
      expected: {
        screen: ['lin', ...blank(rows - 1)],
        history: scrolled,
        cursor: [0, 'lin'.length]
      },
      isScrollOnClear
    },
    {
      name: `erases the top row alone and the rest from the row below it with scroll-on-clear ${mode}`,
      steps: [
        {
          bytes: `${numbered.join('\n')}${top}\u001B[2K\u001B[B\r\u001B[J\u001B[A`
        }
      ],
      expected: { screen: blank(rows), history: scrolled, cursor: [0, 0] },
      isScrollOnClear
    }
  )
}
for (const { name, steps, expected, isScrollOnClear } of cases) {
  void it(`${name}, as tmux does`, () => {
    const screen = terminalScreen({ rows, columns, isScrollOnClear })
    for (const step of steps) {
      if (step.bytes !== undefined) screen.write(step.bytes)
      if (step.rows !== undefined) screen.resize({ rows: step.rows, columns })
    }
    const { screen: lines, history, cursor } = screen.view()
    assert.deepEqual(
      { screen: lines, history, cursor: [cursor.row, cursor.column] },
      expected
    )
  })
}
