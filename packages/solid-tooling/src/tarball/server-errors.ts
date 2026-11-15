/* oxlint-disable node/no-sync -- Mutations only touch the installed package in an owned temporary application. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PRIVATE_MARKER = /PRIVATE_SCENARIO/u
const DEFAULT_MESSAGE = 'The request could not be completed.'
const LOG_MESSAGE = '[server-error] Unexpected failure; private details omitted'
const REQUEST_TIMEOUT = 1000
const HTTP_OK = 200

type ErrorSmoke = { origin: string; scenario: string }
type Mutation = { app: string; scenario: string; mutation: string | undefined }

export async function smokeServerErrors({
  origin,
  scenario
}: ErrorSmoke): Promise<void> {
  const prefix = scenario === 'ssr-i18n' ? '/de' : ''
  const cases = [
    [
      `${prefix}/server-error`,
      scenario === 'ssr-i18n'
        ? 'Die Anfrage konnte nicht abgeschlossen werden.'
        : DEFAULT_MESSAGE
    ],
    [
      `${prefix}/server-error?kind=public`,
      scenario === 'ssr-i18n'
        ? 'Die Anfrage konnte nicht abgeschlossen werden.'
        : DEFAULT_MESSAGE
    ],
    [`${prefix}/server-error?kind=identity`, 'identity=true;observed=true'],
    ...(scenario === 'ssr-i18n' ? [['/it/server-error', DEFAULT_MESSAGE]] : [])
  ]
  for (const [route, message] of cases) {
    assert.ok(route && message)
    const response = await fetch(`${origin}${route}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    })
    assert.equal(response.status, HTTP_OK, route)
    const body = await response.text()
    assert.doesNotMatch(
      body,
      PRIVATE_MARKER,
      'Server error body contains a private marker'
    )
    assert.ok(
      body.includes(message),
      `${route}: expected public message ${message}: ${body}`
    )
  }
}

export function assertServerErrorLog(output: string): void {
  assert.ok(output.includes(LOG_MESSAGE), 'Preview must log a server error')
  assert.doesNotMatch(
    output,
    PRIVATE_MARKER,
    'Preview log contains a private marker'
  )
}

export function mutateServerErrors({
  app,
  scenario,
  mutation
}: Mutation): void {
  if (scenario === 'client-only') return
  const server = path.join(
    app,
    'node_modules/@evertondgn/solid-runtime/src/infra/server'
  )
  if (mutation === 'error-body') {
    const file = path.join(server, 'configureServerErrors/index.ts')
    const source = readFileSync(file, 'utf8')
    assert.ok(source.includes('return createPublicError()'))
    writeFileSync(
      file,
      source.replace(
        'return createPublicError()',
        'return error instanceof Error ? new Error(error.message) : createPublicError()'
      )
    )
  }
  if (mutation === 'error-log') {
    const file = path.join(server, 'logServerFailure/index.ts')
    const source = readFileSync(file, 'utf8')
    assert.ok(source.includes('[line, ...errorDetails(error)]'))
    writeFileSync(
      file,
      source.replace(
        '[line, ...errorDetails(error)]',
        "[line, ...errorDetails(error), error instanceof Error ? error.message : '']"
      )
    )
  }
}

export function importServerFromClient(app: string): void {
  const file = path.join(app, 'src/entry-client.tsx')
  writeFileSync(
    file,
    `import { createPublicError } from '@evertondgn/solid-runtime/server/public-errors'\nconsole.log(createPublicError())\n${readFileSync(file, 'utf8')}`
  )
}
