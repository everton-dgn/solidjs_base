import { render } from '@solidjs/web'
import { flush } from 'solid-js'

import { options } from '../../../tests/theme/config.ts'
import type { ThemeState } from '../../createTheme/types.ts'
import { defineTheme } from '../index.ts'

describe('theme defaults', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () =>
      Object.assign(new EventTarget(), { matches: false })
    )
    vi.stubGlobal('BroadcastChannel', null)
    vi.stubGlobal('location', { protocol: 'https:' })
  })

  it('starts from system and saves a one-year cookie when both are omitted', async () => {
    const configured = defineTheme({
      cookieName: 'default-theme',
      colors: options.colors
    })
    const write = vi
      .spyOn(document, 'cookie', 'set')
      .mockImplementation(vi.fn<() => void>())
    let state: ThemeState | undefined
    const host = document.createElement('div')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const dispose = render(() => {
      state = configured.createTheme()
      return <span>{state.theme()}</span>
    }, host)
    onTestFinished(dispose)

    await expect.poll(() => state?.isReady()).toBe(true)
    expect(configured.defaultTheme).toBe('system')
    expect(state?.theme()).toBe('system')
    state?.setTheme('dark')
    flush()

    expect(write).toHaveBeenCalledWith(
      'default-theme=dark; Path=/; Max-Age=31536000; Secure; SameSite=Lax'
    )
  })

  it('keeps validating a given cookie lifetime', () => {
    expect(() =>
      defineTheme({
        cookieName: 'default-theme',
        cookieMaxAge: 0,
        colors: options.colors
      })
    ).toThrow('cookieMaxAge')
  })
})
