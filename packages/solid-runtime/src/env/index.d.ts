import type * as v from 'valibot'

declare const MAX_PORT = 65_535

type HostSchema = v.OptionalSchema<
  v.SchemaWithPipe<
    readonly [v.StringSchema<undefined>, v.NonEmptyAction<string, undefined>]
  >,
  undefined
>
type PortSchema = v.OptionalSchema<
  v.SchemaWithPipe<
    readonly [
      v.StringSchema<undefined>,
      v.RegexAction<string, undefined>,
      v.ToNumberAction<string, undefined>,
      v.IntegerAction<number, undefined>,
      v.MinValueAction<number, 0, undefined>,
      v.MaxValueAction<number, typeof MAX_PORT, undefined>
    ]
  >,
  undefined
>
type UrlSchema = v.OptionalSchema<
  v.SchemaWithPipe<
    readonly [v.StringSchema<undefined>, v.UrlAction<string, undefined>]
  >,
  undefined
>

export declare const serverEnv: {
  HOST: HostSchema
  PORT: PortSchema
  BASE_URL_TEST: UrlSchema
}
