import * as v from 'valibot'

// Plain JavaScript also loads from an installed package in Node config runners.
const MAX_PORT = 65_535

export const serverEnv = {
  HOST: v.optional(v.pipe(v.string(), v.nonEmpty())),
  PORT: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^\d+$/u),
      v.toNumber(),
      v.integer(),
      v.minValue(0),
      v.maxValue(MAX_PORT)
    )
  ),
  BASE_URL_TEST: v.optional(v.pipe(v.string(), v.url()))
}
