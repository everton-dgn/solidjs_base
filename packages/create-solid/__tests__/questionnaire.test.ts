import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { it } from 'node:test'

import { messages, type Language } from '../src/cli-language.ts'
import { fieldMessage } from '../src/field-messages.ts'
import { generate } from '../src/generate.ts'
import { answerProfile } from '../src/profile-answers.ts'
import { questionnaire } from '../src/questionnaire.ts'
import type { Answers } from '../src/types.ts'
import { CanceledError } from '../src/usage-error.ts'

type Line = readonly [question: string, keys: string]
type SessionOptions = {
  answers?: Answers
  language?: Language
  hasColor?: boolean
}
async function session(
  lines: Line[],
  { answers = {}, language = 'en', hasColor = false }: SessionOptions = {}
) {
  const input = new PassThrough()
  let index = 0
  let transcript = ''
  const output = new PassThrough()
  output.on('data', chunk => {
    const frame = String(chunk)
    transcript += frame
    const line = lines[index]
    if (line && frame.includes(line[0].split('. ')[0] ?? line[0])) {
      index += 1
      setImmediate(() => input.write(line[1]))
    }
  })
  try {
    const result = await questionnaire({
      answers,
      language,
      input,
      output,
      hasColor
    })
    assert.equal(index, lines.length)
    if (!hasColor) {
      assert.doesNotMatch(
        transcript.split('\u001B').join('<ESC>'),
        /<ESC>\[[\d;:]*m/u
      )
    }
    return { result, transcript }
  } finally {
    input.destroy()
  }
}

function allQuestions(language: Language): Line[] {
  const m = messages[language]
  return [
    m.dir,
    m.title,
    m.mode,
    m.setup,
    m.features,
    m.url,
    m.i18n,
    m.locales,
    m.base,
    m.installer,
    m.git,
    m.install
  ].map(label => [label, label === m.setup ? '\u001B[B\r' : '\r'])
}

for (const language of ['pt-BR', 'en', 'es'] as const) {
  void it(`accepts the full questionnaire in ${language}`, async () => {
    const { result } = await session(allQuestions(language), { language })
    assert.deepEqual(
      answerProfile(result),
      answerProfile({
        name: 'solid-app',
        title: 'solid-app',
        mode: 'server',
        locales: 'pt,en,es',
        'base-locale': 'en',
        seo: true,
        'site-url': 'https://example.com',
        theme: true,
        icons: true,
        fonts: true,
        diagnostics: true,
        pm: 'bun',
        git: true,
        install: true
      })
    )
  })
}

for (const [index, [question]] of allQuestions('en').entries()) {
  void it(`cancels at ${question}`, async () => {
    const lines = allQuestions('en').slice(0, index)
    await assert.rejects(
      session([...lines, [question, '\u0003']]),
      CanceledError
    )
  })
}

function tree(dir: string) {
  const hash = createHash('sha256')
  const entries = readdirSync(dir, {
    recursive: true,
    encoding: 'utf8'
  }).toSorted()
  for (const file of entries) {
    const name = path.join(dir, file)
    const stat = lstatSync(name)
    let contents = ''
    if (stat.isSymbolicLink()) contents = readlinkSync(name)
    if (stat.isFile()) {
      contents = createHash('sha256').update(readFileSync(name)).digest('hex')
    }
    hash.update(JSON.stringify([file, stat.mode, contents])).update('\n')
  }
  return hash.digest('hex')
}

void it('retries a rejected URL, skips answered questions and generates the same files as flags', async context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-questionnaire-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const m = messages.en
  const answers = {
    name: path.join(root, 'left', 'app'),
    mode: 'static',
    'no-git': true,
    'no-install': true,
    'no-i18n': true,
    pm: 'npm'
  }
  const { result, transcript } = await session(
    [
      [m.title, '\r'],
      [m.setup, '\u001B[B\r'],
      [m.features, '\u001B[B \u001B[B \u001B[B \u001B[B \r'],
      [m.url, 'bad\r'],
      [fieldMessage('en', 'origin'), '\u0015https://app.example\r'],
      [m.appLanguage, '\r']
    ],
    { answers }
  )
  assert.ok(!transcript.includes(m.locales))
  const flags = {
    ...answers,
    name: path.join(root, 'right', 'app'),
    title: 'app',
    'base-locale': 'en',
    'site-url': 'https://app.example',
    'no-theme': true,
    'no-icons': true,
    'no-fonts': true,
    'no-diagnostics': true
  }
  generate(answerProfile(result))
  generate(answerProfile(flags))
  assert.equal(tree(result.name ?? ''), tree(flags.name))
})

void it('materializes identical default trees after a full terminal session and flag invocation', async context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-full-session-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const lines = allQuestions('en')
  const left = path.join(root, 'left', 'app')
  lines[0] = [messages.en.dir, `${left}\r`]
  const setupQuestions = 2
  lines.splice(
    -setupQuestions,
    setupQuestions,
    [messages.en.git, 'n'],
    [messages.en.install, 'n']
  )
  const { result } = await session(lines)
  generate(answerProfile(result))
  const right = path.join(root, 'right', 'app')
  execFileSync(process.execPath, [
    path.resolve('dist/create-solid.mjs'),
    right,
    '--title',
    'app',
    '--mode',
    'server',
    '--locales',
    'pt,en,es',
    '--base-locale',
    'en',
    '--seo',
    '--site-url',
    'https://example.com',
    '--theme',
    '--icons',
    '--fonts',
    '--diagnostics',
    '--pm',
    'bun',
    '--no-git',
    '--no-install'
  ])
  assert.equal(tree(left), tree(right))
})

void it('infers the only base language and skips SEO on the client', async () => {
  const { result, transcript } = await session(
    [
      [messages.es.title, '\r'],
      [messages.es.setup, '\u001B[B\r']
    ],
    {
      language: 'es',
      answers: {
        name: 'portal',
        mode: 'client',
        locales: 'es',
        theme: true,
        icons: true,
        fonts: true,
        diagnostics: true,
        pm: 'pnpm',
        git: true,
        install: true
      }
    }
  )
  assert.equal(result['base-locale'], 'es')
  for (const label of [
    messages.es.seo,
    messages.es.url,
    messages.es.base,
    messages.es.i18n
  ]) {
    assert.ok(!transcript.includes(label))
  }
})

void it('reports missing tools before the title and recovers only the setup choices', async context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-missing-tools-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  context.mock.method(process, 'cwd', () => root)
  const originalPath = process.env.PATH
  process.env.PATH = root
  try {
    const { result, transcript } = await session(
      [
        [messages.en.title, '\r'],
        [messages.en.setup, '\r'],
        ['https://git-scm.com/downloads', 'n'],
        ['https://pnpm.io/installation', '\u001B[A\r']
      ],
      {
        answers: {
          name: 'portal',
          mode: 'client',
          locales: 'es',
          theme: true,
          icons: true,
          fonts: true,
          diagnostics: true,
          pm: 'pnpm',
          git: true,
          install: true
        }
      }
    )
    assert.ok(transcript.includes('pnpm · not found'))
    assert.match(transcript, /▲ {2}Install Bun/u)
    for (const link of [
      'https://bun.sh',
      'https://git-scm.com/downloads',
      'https://pnpm.io/installation'
    ]) {
      const position = transcript.indexOf(link)
      assert.ok(
        position !== -1 && position < transcript.indexOf(messages.en.title)
      )
    }
    assert.equal(result.title, 'portal')
    assert.equal(result.pm, 'pnpm')
    assert.equal(result['no-git'], true)
    assert.equal(result['no-install'], true)
  } finally {
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
  }
})

for (const language of ['en', 'pt-BR', 'es'] as const) {
  void it(`accepts the recommended defaults in ${language}`, async () => {
    const m = messages[language]
    const { result, transcript } = await session(
      [
        [m.dir, '\r'],
        [m.title, '\r'],
        [m.mode, '\r'],
        [m.setup, '\r']
      ],
      { language }
    )
    assert.deepEqual(
      answerProfile(result),
      answerProfile({ name: 'solid-app', title: 'solid-app', mode: 'server' })
    )
    assert.ok(!transcript.includes(m.features))
  })
}

void it('keeps cursor control with and without Solid blue', async () => {
  for (const hasColor of [false, true]) {
    const m = messages.en
    const { transcript } = await session(
      [
        [m.dir, '\r'],
        [m.title, '\r'],
        [m.mode, '\r'],
        [m.setup, '\r']
      ],
      { hasColor }
    )
    assert.equal(transcript.includes('\u001B[38;2;68;107;158m'), hasColor)
    assert.match(
      transcript.split('\u001B').join('<ESC>'),
      /<ESC>\[[?\d;]*[ABCDEFGHJKhl]/u
    )
  }
})

void it('retries an occupied folder and matches the flags for a custom client app', async context => {
  const root = mkdtempSync(path.join(tmpdir(), 'solid-client-keys-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const left = path.join(root, 'left', 'portal')
  const right = path.join(root, 'right', 'portal')
  const m = messages.en
  const { result } = await session([
    [m.dir, `${process.cwd()}\r`],
    [fieldMessage('en', 'destination'), `\u0015${left}\r`],
    [m.title, 'Portal\r'],
    [m.mode, '\u001B[B\u001B[B\r'],
    [m.setup, '\u001B[B\r'],
    [m.features, '\r'],
    [m.i18n, 'n'],
    [m.appLanguage, 'es-MX\r'],
    [m.installer, '\u001B[B\r'],
    [m.git, 'n'],
    [m.install, 'n']
  ])
  generate(answerProfile(result))
  execFileSync(process.execPath, [
    path.resolve('dist/create-solid.mjs'),
    right,
    '--title',
    'Portal',
    '--mode',
    'client',
    '--pm',
    'pnpm',
    '--no-i18n',
    '--base-locale',
    'es-MX',
    '--no-git',
    '--no-install'
  ])
  assert.equal(tree(left), tree(right))
})

void it('asks for one application language in a translated client app', async () => {
  const m = messages.en
  const { result, transcript } = await session(
    [
      [m.setup, '\u001B[B\r'],
      [m.i18n, 'y'],
      [m.appLanguage, 'es\r']
    ],
    {
      answers: {
        name: 'portal',
        title: 'Portal',
        mode: 'client',
        theme: true,
        icons: true,
        fonts: true,
        diagnostics: true,
        pm: 'bun',
        'no-install': true,
        'no-git': true
      }
    }
  )
  assert.ok(transcript.includes(m.singleLanguage))
  assert.ok(!transcript.includes(m.locales))
  assert.equal(result.locales, 'es')
  assert.equal(result['base-locale'], 'es')
})

void it('redraws a colorless prompt at the new terminal width', async () => {
  const input = new PassThrough()
  const output = Object.assign(new PassThrough(), { columns: 80, rows: 24 })
  let transcript = ''
  let resized = false
  function resizePrompt() {
    transcript = ''
    output.columns = 14
    output.emit('resize')
    setImmediate(() => input.write('\u0003'))
  }
  output.on('data', chunk => {
    transcript += String(chunk)
    if (!resized && transcript.includes(messages.en.title)) {
      resized = true
      setImmediate(resizePrompt)
    }
  })
  try {
    await assert.rejects(
      questionnaire({
        answers: { name: 'portal' },
        language: 'en',
        input,
        output,
        hasColor: false
      }),
      CanceledError
    )
    assert.ok(resized)
    assert.ok(transcript.includes('Application'))
    assert.ok(!transcript.includes(messages.en.title))
  } finally {
    input.destroy()
    output.destroy()
  }
})
