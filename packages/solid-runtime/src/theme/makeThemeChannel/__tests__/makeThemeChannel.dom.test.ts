import { clearThemeCookie } from '../../../tests/theme/clear-theme-cookie.ts'
import {
  THEME_COOKIE_NAME,
  makeThemeChannel
} from '../../../tests/theme/config.ts'
/* oxlint-disable unicorn/no-document-cookie -- Tests exercise cookie persistence and blocking directly. */
import { stubBroadcastChannel } from '../../../tests/theme/stub-broadcast-channel.ts'

const NOW = 10
const SECOND_CALL = 2

let channel: ReturnType<typeof stubBroadcastChannel>

function setup(): void {
  clearThemeCookie()
  channel = stubBroadcastChannel()
}

describe('theme synchronization', () => {
  beforeEach(setup)

  it('ignores invalid messages and uses the canonical cookie for persisted writes', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    receive.mockClear()
    for (const data of [
      null,
      'dark',
      {},
      { theme: 'invalid', isPersisted: true, changedAt: 1, origin: 'remote' },
      { theme: 'dark', isPersisted: true }
    ]) {
      channel.dispatchEvent(new MessageEvent('message', { data }))
    }
    expect(receive).not.toHaveBeenCalled()
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          isPersisted: true,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    expect(receive).toHaveBeenLastCalledWith('light')
  })

  it('retains temporary choice after a blocked write message', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
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
    document.dispatchEvent(new Event('visibilitychange'))
    expect(receive).toHaveBeenLastCalledWith('dark')
    sync.publish({ theme: 'light', isPersisted: false })
    expect(channel.postMessage).toHaveBeenCalledExactlyOnceWith({
      theme: 'light',
      isPersisted: false,
      changedAt: expect.any(Number) as unknown,
      origin: expect.any(String) as unknown
    })
  })

  it('reads the cookie on focus without BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', null)
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).toHaveBeenLastCalledWith('dark')
    clearThemeCookie()
    globalThis.dispatchEvent(new Event('pageshow'))
    expect(receive).toHaveBeenLastCalledWith('system')
  })

  it('preserves temporary choice until the cookie changes', () => {
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
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
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).toHaveBeenLastCalledWith('dark')
    document.cookie = `${THEME_COOKIE_NAME}=system; Path=/`
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).toHaveBeenLastCalledWith('system')
  })

  it('keeps temporary choice after a delayed persisted message', () => {
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    sync.publish({ theme: 'dark', isPersisted: false })
    receive.mockClear()
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'light',
          isPersisted: true,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).not.toHaveBeenCalled()
  })

  it('reads preference only when the tab becomes visible', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    receive.mockClear()
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(receive).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(receive).toHaveBeenLastCalledWith('dark')
  })
})

describe('ordering and temporary choices', () => {
  beforeEach(setup)

  it('discards temporary messages older than the persisted local choice', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    sync.publish({ theme: 'dark', isPersisted: true })
    receive.mockClear()
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'light',
          isPersisted: false,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    expect(receive).not.toHaveBeenCalled()
  })

  it('reconciles current cookie even with an old persisted message', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    document.cookie = `${THEME_COOKIE_NAME}=dark; Path=/`
    sync.publish({ theme: 'dark', isPersisted: true })
    receive.mockClear()
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          isPersisted: true,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    expect(receive).toHaveBeenCalledExactlyOnceWith('light')
  })

  it('applies new messages even with blocked cookie reads', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'dark',
          isPersisted: true,
          changedAt: 1,
          origin: 'remote'
        }
      })
    )
    expect(receive).toHaveBeenLastCalledWith('dark')
  })

  it('accepts new persisted choice after temporary choice', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    document.cookie = `${THEME_COOKIE_NAME}=light; Path=/`
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    sync.publish({ theme: 'dark', isPersisted: false })
    receive.mockClear()
    channel.dispatchEvent(
      new MessageEvent('message', {
        data: {
          theme: 'light',
          isPersisted: true,
          changedAt: 11,
          origin: 'remote'
        }
      })
    )
    expect(receive).toHaveBeenLastCalledWith('light')
  })

  it('increments local versions at the same instant and breaks message ties', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    sync.publish({ theme: 'light', isPersisted: false })
    sync.publish({ theme: 'dark', isPersisted: false })
    expect(channel.postMessage).toHaveBeenNthCalledWith(
      SECOND_CALL,
      expect.objectContaining({ changedAt: 11 })
    )
    for (const [origin, theme] of [
      ['b', 'light'],
      ['a', 'dark'],
      ['b', 'dark']
    ]) {
      channel.dispatchEvent(
        new MessageEvent('message', {
          data: { theme, isPersisted: false, changedAt: 12, origin }
        })
      )
    }
    expect(receive).toHaveBeenLastCalledWith('light')
  })

  it('detects removal of system cookie after temporary choice', () => {
    document.cookie = `${THEME_COOKIE_NAME}=system; Path=/`
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    onTestFinished(sync.dispose)
    sync.publish({ theme: 'dark', isPersisted: false })
    receive.mockClear()
    clearThemeCookie()
    globalThis.dispatchEvent(new Event('focus'))
    expect(receive).toHaveBeenLastCalledWith('system')
  })
})

describe('theme channel lifecycle', () => {
  beforeEach(setup)

  it('removes listeners and closes the channel on disposal', () => {
    const receive = vi.fn<() => void>()
    const sync = makeThemeChannel(receive)
    sync.dispose()
    receive.mockClear()
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
    globalThis.dispatchEvent(new Event('focus'))
    globalThis.dispatchEvent(new Event('pageshow'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(receive).not.toHaveBeenCalled()
    expect(channel.close).toHaveBeenCalledExactlyOnceWith()
  })

  it('tolerates channel publish failures', () => {
    channel.postMessage.mockImplementation(() => {
      throw new Error('closed')
    })
    const sync = makeThemeChannel(vi.fn<() => void>())
    expect(() =>
      sync.publish({ theme: 'dark', isPersisted: true })
    ).not.toThrow()
    expect(channel.close).toHaveBeenCalledExactlyOnceWith()
    sync.dispose()
  })
})
