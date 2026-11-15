import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parse } from 'vite-plus'

import { COLLECTION_IMPORT } from '../index.ts'

type Spelling = { form: string; literal: string }
type Continuation = { at: number; terminator: string }

// The characters themselves: a backslash and the line terminators. The
// parser checks that each spelling below is the import it stands for.
const BACKSLASH = '\\'
const LINE_TERMINATORS: Record<string, string> = {
  LF: '\n',
  CRLF: '\r\n',
  CR: '\r',
  'U+2028': '\u2028',
  'U+2029': '\u2029'
}
// Where a line continuation goes in 'icon:own'.
const PLACES: Record<string, number> = {
  'at the start': 0,
  'in icon': 2,
  'after the colon': 5,
  'in the name': 6,
  'at the end': 8
}
const IMPORT = 'icon:own'

function quoted(text: string): string {
  return `'${text}'`
}

function continued({ at, terminator }: Continuation): string {
  return quoted(
    `${IMPORT.slice(0, at)}${BACKSLASH}${terminator}${IMPORT.slice(at)}`
  )
}

// The spellings of 'icon:own' that the filter has to send to the parser.
const MATCHES: Spelling[] = [
  { form: 'plain', literal: quoted(IMPORT) },
  { form: 'double quotes', literal: `"${IMPORT}"` },
  { form: 'x escape', literal: quoted(`icon:${BACKSLASH}x6fwn`) },
  { form: 'u00 escape', literal: quoted(`icon:${BACKSLASH}u006fwn`) },
  { form: 'u{} escape', literal: quoted(`icon:${BACKSLASH}u{6F}wn`) },
  { form: 'letter after a backslash', literal: quoted(`icon:${BACKSLASH}own`) },
  { form: 'escape in icon:', literal: quoted(`ic${BACKSLASH}x6fn:own`) },
  { form: 'escaped colon', literal: quoted(`icon${BACKSLASH}x3aown`) },
  ...Object.entries(LINE_TERMINATORS).flatMap(([terminator, characters]) =>
    Object.entries(PLACES).map(([place, at]) => ({
      form: `line continuation with ${terminator} ${place}`,
      literal: continued({ at, terminator: characters })
    }))
  )
]
// Strings whose escapes spell no character of an import of a collection.
const MISSES: Spelling[] = [
  { form: 'escape of a new line', literal: quoted(`${BACKSLASH}n`) },
  { form: 'escape of a tab', literal: `"${BACKSLASH}t"` },
  { form: 'escaped backslash', literal: quoted(`${BACKSLASH}${BACKSLASH}`) },
  {
    form: 'escape of a new line in icon:',
    literal: quoted(`icon${BACKSLASH}n`)
  },
  { form: 'escape of a color', literal: quoted(`${BACKSLASH}x1b[0m`) },
  { form: 'escape of a dash', literal: quoted(`${BACKSLASH}u2014`) },
  { form: 'escape of a space', literal: quoted(`${BACKSLASH}x20`) },
  { form: 'escape of an emoji', literal: quoted(`${BACKSLASH}u{1F600}`) },
  { form: 'null escape', literal: quoted(`${BACKSLASH}0`) },
  { form: 'escaped quote', literal: quoted(`${BACKSLASH}'`) },
  { form: 'import of one icon', literal: quoted('icon:own/star') },
  { form: 'collection in upper case', literal: quoted('icon:Own') }
]

// The specifier of an import as the parser of the build reads it.
async function specifierOf(literal: string): Promise<string | undefined> {
  const { program, errors } = await parse(
    'entry.js',
    `import { Star } from ${literal}`
  )
  assert.deepEqual(errors, [])
  const [statement] = program.body
  return statement?.type === 'ImportDeclaration'
    ? statement.source.value
    : undefined
}

describe('COLLECTION_IMPORT', () => {
  it('matches every spelling of an import of a collection', async () => {
    for (const { form, literal } of MATCHES) {
      assert.equal(await specifierOf(literal), IMPORT, form)
      assert.equal(COLLECTION_IMPORT.test(literal), true, form)
    }
  })

  it('matches no escape that spells nothing of such an import', () => {
    for (const { form, literal } of MISSES) {
      assert.equal(COLLECTION_IMPORT.test(literal), false, form)
    }
  })
})
