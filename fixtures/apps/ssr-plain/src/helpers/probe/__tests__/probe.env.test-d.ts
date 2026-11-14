import type { env as client } from 'virtual:solid-env/client'
import type { env as server } from 'virtual:solid-env/server'
import { expectTypeOf } from 'vite-plus/test'

describe('packaged environment types', () => {
  it('infers transformed and optional values through the package', () => {
    expectTypeOf<typeof server.HOST>().toEqualTypeOf<string | undefined>()
    expectTypeOf<typeof server.PORT>().toEqualTypeOf<number | undefined>()
    expectTypeOf<typeof server.BASE_URL_TEST>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<typeof server.SCENARIO_LABEL>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<typeof server.VITE_SCENARIO_LABEL>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<typeof client.VITE_SCENARIO_LABEL>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<keyof typeof client>().toEqualTypeOf<'VITE_SCENARIO_LABEL'>()
  })
})
