import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from 'node:process'
import { test, type TestContext } from 'node:test'

import checkServerLog from '../teardown.ts'

const BASE_URL = 'http://127.0.0.1:4317'
const STARTUP = `  ➜  Local:   ${BASE_URL}/\n`
const OMITTED = '[server-error] Unexpected failure; private details omitted\n'
const SECONDARY_URL = 'http://127.0.0.1:4319/'

async function logFile(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'server-log-teardown-'))
  // Sandbox created by this test: removing it directly is the right cleanup.
  context.after(() => rm(directory, { recursive: true, force: true }))
  const previous = {
    SERVER_LOG_FILE: env.SERVER_LOG_FILE,
    BASE_URL_TEST: env.BASE_URL_TEST,
    TEST_PUBLICATION_LOAD: env.TEST_PUBLICATION_LOAD,
    SERVER_LOG_SECONDARY: env.SERVER_LOG_SECONDARY,
    PUBLICATION_SECONDARY_URL: env.PUBLICATION_SECONDARY_URL
  }
  context.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      // Assigning undefined to env stores the text "undefined".
      if (value === undefined) Reflect.deleteProperty(env, name)
      else env[name] = value
    }
  })
  const file = path.join(directory, 'server.log')
  env.SERVER_LOG_FILE = file
  env.BASE_URL_TEST = BASE_URL
  Reflect.deleteProperty(env, 'TEST_PUBLICATION_LOAD')
  return file
}

async function secondaryLog(context: TestContext): Promise<string> {
  const file = await logFile(context)
  await writeFile(file, STARTUP)
  const secondary = `${file}.secondary`
  env.TEST_PUBLICATION_LOAD = 'true'
  env.SERVER_LOG_SECONDARY = secondary
  env.PUBLICATION_SECONDARY_URL = SECONDARY_URL
  return secondary
}

test('accepts a preview log without private markers', async context => {
  const file = await logFile(context)
  await writeFile(file, `${STARTUP}${OMITTED}PRIVATE details\n`)

  await checkServerLog()
})

test('rejects a log without the preview startup', async context => {
  const file = await logFile(context)
  await writeFile(file, OMITTED)

  await assert.rejects(checkServerLog(), /does not show the preview startup/u)
})

test('rejects the private markers of every suite, colored ones included', async context => {
  const file = await logFile(context)
  for (const marker of [
    `PRIVATE_BACKEND_${crypto.randomUUID()}`,
    `PRIVATE_MARKDOWN_${crypto.randomUUID()}`,
    `PRIVATE_MARKDOWN_REUSED_${crypto.randomUUID()}`,
    '\u001B[31mPRIVATE_\u001B[39mHEADER'
  ]) {
    await writeFile(file, `${STARTUP}Error: ${marker}\n`)

    await assert.rejects(checkServerLog(), /private marker/u, marker)
  }
})

test('rejects a run without the log file configured', async context => {
  await logFile(context)
  Reflect.deleteProperty(env, 'SERVER_LOG_FILE')

  await assert.rejects(checkServerLog(), /not configured/u)
})

test('checks the secondary server log under publication load', async context => {
  const secondary = await secondaryLog(context)
  await writeFile(secondary, '  ➜  Local:   http://127.0.0.1:4319/\n')
  await checkServerLog()

  await writeFile(secondary, STARTUP)
  await assert.rejects(checkServerLog(), /does not show the preview startup/u)

  await writeFile(
    secondary,
    `  ➜  Local:   ${SECONDARY_URL}\nError: PRIVATE_BACKEND_KEY\n`
  )
  await assert.rejects(checkServerLog(), /private marker/u)
})

test('rejects publication load without the secondary log configured', async context => {
  await secondaryLog(context)
  Reflect.deleteProperty(env, 'SERVER_LOG_SECONDARY')

  await assert.rejects(checkServerLog(), /not configured/u)
})
