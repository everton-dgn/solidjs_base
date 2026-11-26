import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { it } from 'node:test'
import { stripVTControlCharacters } from 'node:util'

import type { Language } from '../src/cli-language.ts'
import { questionnaire } from '../src/questionnaire.ts'
import { CanceledError } from '../src/usage-error.ts'
import { questionFrames, titleFrames } from './question-screen.ts'

void it('shows the message of a validation error only while the title question is in error, as Clack does', async () => {
  const frames = await titleFrames({ columns: 80, keys: ['  ', '\r', 'y'] })
  const [, failed = '', next = ''] = frames.map(frame =>
    stripVTControlCharacters(frame)
  )
  assert.match(failed, /▲ {2}Application title/u)
  assert.match(failed, /└ {2}Enter a title/u)
  assert.match(next, /◆ {2}Application title/u)
  assert.doesNotMatch(next, /Enter a title/u)
})

const usageExitCode = 2
type Sentences = { question: string; flag: string }
// The sentences the owner chose for a title of only spaces.
const spacesOnly = {
  en: {
    question:
      'Enter a title that is not only spaces, on one line without control characters.',
    flag: '--title requires text that is neither empty nor only spaces, on one line without control characters'
  },
  'pt-BR': {
    question:
      'Digite um título que não seja só espaços, em uma linha, sem caracteres de controle.',
    flag: '--title exige um texto que não seja vazio nem só espaços, em uma linha sem caracteres de controle'
  },
  es: {
    question:
      'Escribe un título que no sea solo espacios, de una línea y sin caracteres de control.',
    flag: '--title requiere un texto que no esté vacío ni sea solo espacios, en una línea sin caracteres de control'
  }
} as const satisfies Record<Language, Sentences>
for (const language of ['en', 'pt-BR', 'es'] as const) {
  const { question, flag } = spacesOnly[language]
  void it(`says that a title of only spaces is refused at the question and for --title in ${language}`, async () => {
    // A screen wide enough for the sentence on one row.
    const columns = 200
    const frames = await questionFrames({
      columns,
      keys: ['   ', '\r'],
      async ask({ input, output }) {
        await assert.rejects(
          questionnaire({
            answers: { name: 'pilot-app' },
            language,
            input,
            output,
            hasColor: false
          }),
          CanceledError
        )
      }
    })
    const failed = stripVTControlCharacters(frames.at(-1) ?? '')
    assert.ok(failed.includes(`└  ${question}`), failed)
    const dir = mkdtempSync(path.join(tmpdir(), 'solid-title-'))
    try {
      const child = spawnSync(
        process.execPath,
        [
          'src/create-solid.ts',
          path.join(dir, 'app'),
          '--title',
          '   ',
          '--lang',
          language
        ],
        { encoding: 'utf8' }
      )
      assert.equal(child.status, usageExitCode, child.stderr)
      assert.ok(child.stderr.includes(flag), child.stderr)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
