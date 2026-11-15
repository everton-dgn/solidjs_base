import type { StartMiddleware as PluginStartMiddleware } from '@solidjs/vite-plugin'
import { expectTypeOf } from 'vite-plus/test'

import type { StartMiddleware } from '../types.ts'

describe('start middleware type', () => {
  it('stays equal to the type of the Solid plugin', () => {
    expectTypeOf<StartMiddleware>().toEqualTypeOf<PluginStartMiddleware>()
  })
})
