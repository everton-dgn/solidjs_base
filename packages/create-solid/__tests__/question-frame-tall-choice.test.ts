import assert from 'node:assert/strict'
import { PassThrough, type Writable } from 'node:stream'
import { it } from 'node:test'

import { confirm, multiselect, select } from '@clack/prompts'

import { questionFrame } from '../src/questionFrame/index.ts'
import { questionnaire } from '../src/questionnaire.ts'
import { CanceledError } from '../src/usage-error.ts'
import { turns, type Pause } from './question-screen.ts'

// A selection, a multiple selection or a confirmation taller than the screen, stopped after a key that changes a row below
// the top of the screen. Clack moves up only as far as the top of the screen and writes from there, so the rows the
// question frame records are the rows on the screen.
const escape = '\u001B'
const hide = `${escape}[?25l`
const right = `${escape}[C`
const down = `${escape}[B`
const space = ' '
const enter = '\r'
const ctrlC = '\u0003'
const columns = 80
// oxlint-disable-next-line no-control-regex
const style = /\u001B\[[\d;]*m/gu

type Output = PassThrough & { columns: number; rows: number }
type Terminal = { stream: Output; written: string[] }
function terminal(rows: number): Terminal {
  const written: string[] = []
  const stream = Object.assign(new PassThrough(), { columns, rows })
  stream.on('data', chunk => written.push(String(chunk)))
  return { stream, written }
}
// The rows Clack wrote when it opened the last question of the writes.
function opening(written: string[]): string[] {
  const start = written.findLastIndex(chunk => chunk.includes(hide))
  return written
    .slice(start + 1)
    .join('')
    .split('\n')
}
type Stop = { erased: string[]; flushed: string[] }
type Stopping = {
  frame: ReturnType<typeof questionFrame<Output>>
  written: string[]
  pause: Pause
}
function stop({ frame, written, pause }: Stopping): Stop {
  written.length = 0
  if (pause === 'erase') frame.erase()
  else frame.hold()
  const erased = [...written]
  written.length = 0
  frame.flush()
  return { erased, flushed: [...written] }
}
const pauseName = (pause: Pause) => (pause === 'erase' ? 'erased' : 'held')

type Prompting = { input: PassThrough; output: Writable; isFinal: boolean }
type Choice = {
  question: string
  rows: number
  keyName: string
  key: string
  open: (prompting: Prompting) => Promise<unknown>
}
const values = (names: string[]) => names.map(value => ({ value }))
const confirmation = ({ input, output, isFinal }: Prompting) =>
  confirm({
    message: 'Create?',
    active: 'Yes',
    inactive: 'No',
    initialValue: !isFinal,
    input,
    output
  })
const choices: Choice[] = [
  {
    question: 'a confirmation',
    rows: 4,
    keyName: 'an arrow that changes the row below the title',
    key: right,
    open: confirmation
  },
  {
    question: 'a confirmation',
    rows: 3,
    keyName: 'an arrow that changes the top row of the screen',
    key: right,
    open: confirmation
  },
  {
    question: 'a selection of two options',
    rows: 5,
    keyName: 'an arrow that changes two rows below the title',
    key: down,
    open: ({ input, output, isFinal }) =>
      select({
        message: 'Setup',
        showInstructions: false,
        options: [
          { value: 'recommended', label: 'Recommended' },
          { value: 'custom', label: 'Customize' }
        ],
        initialValue: isFinal ? 'custom' : 'recommended',
        input,
        output
      })
  },
  {
    question: 'a selection of four options',
    rows: 5,
    keyName: 'an arrow between two options in the middle',
    key: down,
    open: ({ input, output, isFinal }) =>
      select({
        message: 'Pick',
        showInstructions: false,
        options: values(['one', 'two', 'three', 'four']),
        initialValue: isFinal ? 'three' : 'two',
        input,
        output
      })
  },
  {
    question: 'a multiple selection',
    rows: 6,
    keyName: 'a space on its first option',
    key: space,
    open: ({ input, output, isFinal }) =>
      multiselect({
        message: 'Pick',
        options: values(['one', 'two', 'three']),
        initialValues: isFinal ? ['two', 'three'] : ['one', 'two', 'three'],
        input,
        output
      })
  }
]
for (const choice of choices) {
  for (const pause of ['erase', 'hold'] as const) {
    void it(`draws back the rows on screen of ${choice.question} taller than a screen of ${choice.rows} rows after ${choice.keyName}, ${pauseName(pause)}`, async () => {
      // The rows on screen after the key, from Clack opening the question in its state after the key on a screen of the same size.
      const final = terminal(choice.rows)
      const finalInput = new PassThrough()
      const finalAnswer = choice.open({
        input: finalInput,
        output: final.stream,
        isFinal: true
      })
      await turns()
      const onScreen = opening(final.written).slice(-choice.rows).join('\n')
      finalInput.write(ctrlC)
      await finalAnswer
      const { stream, written } = terminal(choice.rows)
      const frame = questionFrame(stream)
      const input = new PassThrough()
      const answer = choice.open({
        input,
        output: frame.output,
        isFinal: false
      })
      await turns()
      const opened = opening(written)
      assert.ok(opened.length > choice.rows, JSON.stringify(opened))
      input.write(choice.key)
      await turns()
      const stopped = stop({ frame, written, pause })
      input.write(ctrlC)
      await answer
      // The question stays on the screen, the shell writes below it, and the flush draws its rows that were on the screen.
      assert.deepEqual(stopped, { erased: [], flushed: [onScreen] })
    })
  }
}

// The multiple selection of the features, the one the questionnaire opens after Customize, with every feature selected.
const featureRows = 6
const featuresAfterSpace = [
  '◆  Features',
  '│  ◻ SEO metadata',
  '│  ...',
  '│  Space to toggle, Enter to continue',
  '└',
  ''
].join('\n')
for (const pause of ['erase', 'hold'] as const) {
  void it(`draws back the rows on screen of the features taller than a screen of ${featureRows} rows after a space, ${pauseName(pause)}`, async () => {
    const { stream, written } = terminal(featureRows)
    const frame = questionFrame(stream)
    const input = new PassThrough()
    const answer = questionnaire({
      answers: { name: 'pilot-app', title: 'Pilot', mode: 'server' },
      language: 'en',
      input,
      output: frame.output,
      hasColor: false,
      follow: frame.follow
    })
    await turns()
    for (const key of [down, enter]) {
      input.write(key)
      await turns()
    }
    const opened = opening(written)
    assert.ok(opened.length > featureRows, JSON.stringify(opened))
    input.write(space)
    await turns()
    const { erased, flushed } = stop({ frame, written, pause })
    input.write(ctrlC)
    await assert.rejects(answer, CanceledError)
    assert.deepEqual(
      { erased, flushed: flushed.map(drawn => drawn.replaceAll(style, '')) },
      { erased: [], flushed: [featuresAfterSpace] }
    )
  })
}
