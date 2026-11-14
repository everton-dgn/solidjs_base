import * as v from 'valibot'
import { expectTypeOf } from 'vite-plus/test'

import { serverEnv } from '../index.js'

const MAX_PORT = 65_535
const PREVIEW_PORT = 4417
const EMPTY_ENV: Record<string, string | undefined> = {}
type EnvOutput = v.InferOutput<v.ObjectSchema<typeof serverEnv, undefined>>
const EXPECTED_OUTPUT: EnvOutput = {
  HOST: '127.0.0.1',
  PORT: PREVIEW_PORT,
  BASE_URL_TEST: 'http://127.0.0.1:4417'
}

describe('packaged environment schemas', () => {
  it('the preset variables are optional and do not add application keys', () => {
    expect(Object.keys(serverEnv)).toStrictEqual([
      'HOST',
      'PORT',
      'BASE_URL_TEST'
    ])
    expect(v.parse(v.object(serverEnv), {})).toStrictEqual({})
  })

  it('host accepts a nonempty string and rejects an empty value', () => {
    expect(v.parse(serverEnv.HOST, '127.0.0.1')).toBe('127.0.0.1')
    expect(v.safeParse(serverEnv.HOST, '').success).toBe(false)
  })

  it('port converts decimal strings including both boundary values', () => {
    for (const [input, output] of [
      ['0', 0],
      ['65535', MAX_PORT],
      ['004417', PREVIEW_PORT]
    ] as const) {
      expect(v.parse(serverEnv.PORT, input)).toBe(output)
    }
    expect(v.parse(serverEnv.PORT, EMPTY_ENV.PORT)).toBeUndefined()
  })

  it('port rejects malformed, fractional and out-of-range values', () => {
    for (const input of [
      'abc',
      '',
      '-1',
      '1.5',
      ' 80',
      '+80',
      '1e3',
      '65536'
    ]) {
      expect({
        input,
        success: v.safeParse(serverEnv.PORT, input).success
      }).toStrictEqual({ input, success: false })
    }
  })

  it('the test base URL must be a URL when present', () => {
    const url = 'http://127.0.0.1:4417'
    expect(v.parse(serverEnv.BASE_URL_TEST, url)).toBe(url)
    expect(
      v.parse(serverEnv.BASE_URL_TEST, EMPTY_ENV.BASE_URL_TEST)
    ).toBeUndefined()
    expect(v.safeParse(serverEnv.BASE_URL_TEST, 'localhost').success).toBe(
      false
    )
  })

  // The handwritten declaration must agree with both the expected types and JS output.
  it('the declaration describes the JavaScript input and output', () => {
    expectTypeOf<v.InferInput<typeof serverEnv.PORT>>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<v.InferOutput<typeof serverEnv.PORT>>().toEqualTypeOf<
      number | undefined
    >()
    expectTypeOf<v.InferOutput<typeof serverEnv.HOST>>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<v.InferOutput<typeof serverEnv.BASE_URL_TEST>>().toEqualTypeOf<
      string | undefined
    >()
    expect(
      v.parse(v.object(serverEnv), { ...EXPECTED_OUTPUT, PORT: '4417' })
    ).toStrictEqual(EXPECTED_OUTPUT)
  })
})
