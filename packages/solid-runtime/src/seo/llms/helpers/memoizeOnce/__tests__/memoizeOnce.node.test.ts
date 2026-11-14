import { memoizeOnce } from '../index.ts'

type Render = () => string

const RENDERS_WITHOUT_CACHE = 2

describe('memoizing text once', () => {
  it('renders once and reuses the text', () => {
    const render = vi.fn<Render>(() => 'text')
    const memoized = memoizeOnce({ render, isEnabled: true })

    expect(memoized()).toBe('text')
    expect(memoized()).toBe('text')
    expect(render).toHaveBeenCalledOnce()
  })

  it('also caches empty text', () => {
    const render = vi.fn<Render>(() => '')
    const memoized = memoizeOnce({ render, isEnabled: true })

    expect(memoized()).toBe('')
    expect(memoized()).toBe('')
    expect(render).toHaveBeenCalledOnce()
  })

  it('caches any value including objects and undefined', () => {
    const manifest = { entries: [] }
    const memoizedObject = memoizeOnce({
      render: () => manifest,
      isEnabled: true
    })
    const render = vi.fn<() => string | undefined>()
    const memoizedUndefined = memoizeOnce({ render, isEnabled: true })

    expect(memoizedObject()).toBe(memoizedObject())
    expect(memoizedObject()).toBe(manifest)
    expect(memoizedUndefined()).toBeUndefined()
    expect(memoizedUndefined()).toBeUndefined()
    expect(render).toHaveBeenCalledOnce()
  })

  it('does not cache failures and retries rendering on the next call', () => {
    const render = vi
      .fn<Render>()
      .mockImplementationOnce(() => {
        throw new Error('manifest unavailable')
      })
      .mockReturnValue('text')
    const memoized = memoizeOnce({ render, isEnabled: true })

    expect(() => memoized()).toThrow('manifest unavailable')
    expect(memoized()).toBe('text')
    expect(render).toHaveBeenCalledTimes(RENDERS_WITHOUT_CACHE)
  })

  it('returns the original render without caching when disabled', () => {
    const render = vi.fn<Render>(() => 'text')
    const memoized = memoizeOnce({ render, isEnabled: false })

    expect(memoized).toBe(render)
    memoized()
    memoized()
    expect(render).toHaveBeenCalledTimes(RENDERS_WITHOUT_CACHE)
  })
})
