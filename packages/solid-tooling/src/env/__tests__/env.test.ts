import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as v from 'valibot'

import { serverEnv } from '../index.ts'

const MAX_PORT = 65_535
const PREVIEW_PORT = 4417
const EMPTY_ENV: Record<string, string | undefined> = {}

test('the preset variables are optional and do not add application keys', () => {
  assert.deepEqual(Object.keys(serverEnv), ['HOST', 'PORT', 'BASE_URL_TEST'])
  assert.deepEqual(v.parse(v.object(serverEnv), {}), {})
})

test('host accepts a nonempty string and rejects an empty value', () => {
  assert.equal(v.parse(serverEnv.HOST, '127.0.0.1'), '127.0.0.1')
  assert.equal(v.safeParse(serverEnv.HOST, '').success, false)
})

test('port converts decimal strings including both boundary values', () => {
  for (const [input, output] of [
    ['0', 0],
    ['65535', MAX_PORT],
    ['004417', PREVIEW_PORT]
  ] as const) {
    assert.equal(v.parse(serverEnv.PORT, input), output)
  }
  assert.equal(v.parse(serverEnv.PORT, EMPTY_ENV.PORT), undefined)
})

test('port rejects malformed, fractional and out-of-range values', () => {
  for (const input of ['abc', '', '-1', '1.5', ' 80', '+80', '1e3', '65536']) {
    assert.equal(v.safeParse(serverEnv.PORT, input).success, false, input)
  }
})

test('the test base URL must be a URL when present', () => {
  const url = 'http://127.0.0.1:4417'
  assert.equal(v.parse(serverEnv.BASE_URL_TEST, url), url)
  assert.equal(
    v.parse(serverEnv.BASE_URL_TEST, EMPTY_ENV.BASE_URL_TEST),
    undefined
  )
  assert.equal(v.safeParse(serverEnv.BASE_URL_TEST, 'localhost').success, false)
})
