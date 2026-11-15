import { expectTypeOf } from 'vite-plus/test'

import type { SeoSite } from '../../types.ts'
import type { createSeo } from '../index.ts'

type Options = Parameters<typeof createSeo>[0]
type RouteOptions = { route: true; site: SeoSite }
type DataOptions = { structuredData: () => undefined }
type BothOptions = RouteOptions & DataOptions

describe('exclusive createSeo contract', () => {
  it('accepts exactly one mode without running the primitive outside an owner', () => {
    expectTypeOf<RouteOptions>().toExtend<Options>()
    expectTypeOf<DataOptions>().toExtend<Options>()
    expectTypeOf<BothOptions>().not.toExtend<Options>()
    expectTypeOf<Record<string, never>>().not.toExtend<Options>()
  })
})
