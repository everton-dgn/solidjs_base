import { prepareClientLocale } from '../index.ts'

describe('client entry locale preparation', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/de')
  })

  it('reloads before hydration when history changed locale during bundle loading', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      performance.mark('http://localhost/fr')
    ])
    const reload = vi.fn<() => void>()
    const result = prepareClientLocale({ reload })
    expect(result.shouldHydrate).toBe(false)
    expect(reload).toHaveBeenCalledExactlyOnceWith()
    result.dispose()
  })

  it('installs the history guard before hydration and disposes it', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([])
    const reload = vi.fn<() => void>()
    const result = prepareClientLocale({ reload })
    onTestFinished(result.dispose)
    expect(result.shouldHydrate).toBe(true)
    expect(reload).not.toHaveBeenCalled()
    history.replaceState(null, '', '/fr')
    globalThis.dispatchEvent(new PopStateEvent('popstate'))
    expect(reload).toHaveBeenCalledOnce()
    result.dispose()
    globalThis.dispatchEvent(new PopStateEvent('popstate'))
    expect(reload).toHaveBeenCalledOnce()
  })

  it.each(['/de', '/unknown'])(
    'hydrates the document when its loaded locale is %s',
    path => {
      vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
        performance.mark(`http://localhost${path}`)
      ])
      const result = prepareClientLocale()
      onTestFinished(result.dispose)
      expect(result.shouldHydrate).toBe(true)
    }
  )
})
