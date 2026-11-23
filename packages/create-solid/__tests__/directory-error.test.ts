import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { it } from 'node:test'

import { directoryError } from '../src/directoryError/index.ts'

function terminal(columns: number): Writable {
  return Object.assign(new Writable(), { columns })
}

void it('returns a text with no sentence before the path unchanged', () => {
  const dir = 'a-directory-that-is-longer-than-the-line'
  const narrow = 20
  assert.equal(
    directoryError({ text: dir, dir, output: terminal(narrow) }),
    dir
  )
})

void it('moves the path to its own indented lines only when the error passes the width', () => {
  const dir = 'app-directory'
  const text = `Must be empty: ${dir}`
  const fitting = `└  ${text}`.length
  assert.equal(directoryError({ text, dir, output: terminal(fitting) }), text)
  assert.equal(
    directoryError({ text, dir, output: terminal(fitting - 1) }),
    `Must be empty:\n   ${dir}`
  )
  const pieceWidth = 7
  assert.equal(
    directoryError({ text, dir, output: terminal(pieceWidth + '   '.length) }),
    'Must be\n   empty:\n   app-dir\n   ectory'
  )
})

void it('keeps every character of a path that is cut at a space', () => {
  const dir = 'my app directory'
  const text = `Must be empty: ${dir}`
  const pieceWidth = 6
  const indent = '\n   '
  const error = directoryError({
    text,
    dir,
    output: terminal(pieceWidth + '   '.length)
  })
  const sentence = ['Must', 'be', 'empty:'].join(indent)
  const pieces = ['my app', ' direc', 'tory']
  assert.equal(error, [sentence, ...pieces].join(indent))
  assert.equal(pieces.join(''), dir)
})
