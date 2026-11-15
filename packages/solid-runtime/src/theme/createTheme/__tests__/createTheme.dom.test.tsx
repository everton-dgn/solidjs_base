import { render } from '@solidjs/web'
/* oxlint-disable unicorn/no-document-cookie -- Tests exercise cookie persistence and blocking directly. */
import { flush } from 'solid-js'

import { blockCookie } from '../../../tests/theme/block-cookie.ts'
import { clearThemeCookie } from '../../../tests/theme/clear-theme-cookie.ts'
import {
  createTheme,
  THEME_COOKIE_NAME,
  readTheme,
  saveTheme
} from '../../../tests/theme/config.ts'
import { stubBroadcastChannel } from '../../../tests/theme/stub-broadcast-channel.ts'
import type { ResolvedTheme, Theme } from '../../types.ts'
import type { ThemeState } from '../types.ts'

describe('theme primitive', () => {
  let state: ThemeState
  let media: EventTarget & { matches: boolean }

  beforeEach(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.style.colorScheme = ''
    clearThemeCookie()
    media = Object.assign(new EventTarget(), { matches: true })
    vi.stubGlobal('matchMedia', () => media)
    vi.stubGlobal('BroadcastChannel', null)
  })

  function mount(): void {
    const host = document.createElement('div')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const dispose = render(() => {
      state = createTheme()
      return <span>{state.theme()}</span>
    }, host)
    onTestFinished(dispose)
  }

  function changeSystemTheme(theme: ResolvedTheme): void {
    media.matches = theme === 'dark'
    media.dispatchEvent(new Event('change'))
    flush()
  }

  it('follows the system without saved preference', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    expect(state.theme()).toBe('system')
    expect(state.resolvedTheme()).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.cookie).not.toContain(`${THEME_COOKIE_NAME}=`)
  })

  it('tracks system changes with system preference', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    changeSystemTheme('light')
    expect(state.resolvedTheme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('retains explicit choice when the system changes', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    state.setTheme('light')
    changeSystemTheme('light')
    changeSystemTheme('dark')
    expect(state.resolvedTheme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBe('light')
    state.setTheme('system')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('reconciles cross-tab changes and preference removal', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    saveTheme('light')
    globalThis.dispatchEvent(new Event('focus'))
    await expect.poll(() => state.theme()).toBe('light')
    clearThemeCookie()
    globalThis.dispatchEvent(new Event('pageshow'))
    await expect.poll(() => state.theme()).toBe('system')
    await expect
      .poll(() => document.documentElement.classList.contains('dark'))
      .toBe(true)
  })

  it('keeps switching when storage is blocked', async () => {
    blockCookie()
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    state.setTheme('light')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBeUndefined()
  })

  it('ignores an invalid theme received through a cast', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    state.setTheme('light')
    flush()
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Test invalid input.
    const invalid = 'sepia' as unknown as Theme
    state.setTheme(invalid)
    flush()
    expect(state.theme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(readTheme()).toBe('light')
  })

  it('retains choices made immediately after mounting', async () => {
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    mount()
    state.setTheme('light')
    expect(document.documentElement).toHaveClass('light')
    expect(readTheme()).toBe('light')
    await expect.poll(() => state.isReady()).toBe(true)
    expect(state.theme()).toBe('light')
    expect(document.documentElement).toHaveClass('light')
  })

  it('applies theme before attempting cookie write', async () => {
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    const applied: boolean[] = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
      applied.push(document.documentElement.classList.contains('light'))
    })
    state.setTheme('light')
    expect(applied).toStrictEqual([true])
  })

  it('applies the theme received from another tab to the DOM', async () => {
    media.matches = false
    const channel = stubBroadcastChannel()
    mount()
    await expect.poll(() => state.isReady()).toBe(true)
    expect(document.documentElement).toHaveClass('light')
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          isPersisted: false,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    await expect.poll(() => state.theme()).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
