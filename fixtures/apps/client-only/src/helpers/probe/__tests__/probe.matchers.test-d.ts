import { expectTypeOf } from 'vite-plus/test'
import { page } from 'vite-plus/test/browser/context'

type BrowserAssertion = ReturnType<typeof expect.element>

describe('browser matcher types', () => {
  it('keeps browser matchers asynchronous', async () => {
    expectTypeOf<ReturnType<BrowserAssertion['toBeVisible']>>().toEqualTypeOf<
      Promise<void>
    >()
    await expect.element(page.getByRole('button')).toBeVisible()
  })
})
