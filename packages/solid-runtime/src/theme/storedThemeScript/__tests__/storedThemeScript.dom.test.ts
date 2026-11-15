import {
  HOSTILE_TEXT,
  THEME_STORAGE_KEY,
  localOptions
} from '../../../tests/theme/local-config.ts'
import type { LocalStorageThemeOptions } from '../../types.ts'
import { storedThemeScript } from '../index.js'

// Differs from both theme colors, so only the script can set either of them.
const INITIAL_COLOR = '#123456'
const LARGE_VALUE_LENGTH = 1_000_000

function blocked(): never {
  throw new Error('blocked')
}

function execute(options: LocalStorageThemeOptions = localOptions): void {
  // oxlint-disable-next-line no-new-func, typescript/no-unsafe-call, typescript/no-implied-eval -- Execute the generated script as a browser would.
  new Function(storedThemeScript(options))()
}

function appendMeta(): HTMLMetaElement {
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = INITIAL_COLOR
  document.head.append(meta)
  onTestFinished(() => meta.remove())
  return meta
}

// The order of an SSR document, where the meta precedes the script.
function runAfterMeta(): HTMLMetaElement {
  const meta = appendMeta()
  execute()
  return meta
}

// Registered after the observer of the script, so it is delivered after it.
function nextHeadMutation(): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const observer = new MutationObserver(() => {
    observer.disconnect()
    resolve(true)
  })
  observer.observe(document.head, { childList: true })
  return promise
}

describe('stored theme script', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.style.colorScheme = ''
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'light']
  ] as const)('applies the stored %s choice as %s', (stored, resolved) => {
    localStorage.setItem(THEME_STORAGE_KEY, stored)
    const meta = runAfterMeta()
    expect(document.documentElement).toHaveClass(resolved)
    expect(document.documentElement.style.colorScheme).toBe(resolved)
    expect(meta.content).toBe(localOptions.colors[resolved])
  })

  it('follows the system preference without a valid choice', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    runAfterMeta()
    expect(document.documentElement).toHaveClass('dark')
  })

  it('falls back to the default theme when storage is blocked', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    vi.stubGlobal('localStorage', { getItem: blocked })
    runAfterMeta()
    expect(document.documentElement).toHaveClass('light')
  })

  it.each([
    ['a large value', 'dark'.repeat(LARGE_VALUE_LENGTH)],
    ['JSON', '{"theme":"dark"}'],
    ['a JSON string', '"dark"'],
    ['another case', 'DARK'],
    ['padding', ' dark'],
    ['a prototype key', '__proto__'],
    ['a prototype method', 'includes']
  ])('ignores %s read from storage', (_label, value) => {
    vi.stubGlobal('localStorage', { getItem: () => value })
    expect(runAfterMeta).not.toThrow()
    expect(document.documentElement).toHaveClass('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })
})

describe('stored theme script before the theme-color meta', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.style.colorScheme = ''
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
  })

  it('sets the meta that the parser adds after it', async () => {
    execute()
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    const meta = appendMeta()
    await expect.poll(() => meta.content).toBe(localOptions.colors.dark)
  })

  it('leaves a meta added after the parsing ends to the application', async () => {
    execute()
    document.dispatchEvent(new Event('readystatechange'))
    const delivered = nextHeadMutation()
    const meta = appendMeta()
    await delivered
    expect(meta.content).toBe(INITIAL_COLOR)
    expect(document.documentElement).toHaveClass('dark')
  })

  it('applies one theme when the page loads the script twice', async () => {
    execute()
    execute()
    const meta = appendMeta()
    await expect.poll(() => meta.content).toBe(localOptions.colors.dark)
    expect([...document.documentElement.classList]).toStrictEqual(['dark'])
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('runs without a meta in the document', () => {
    expect(execute).not.toThrow()
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull()
    expect(document.documentElement).toHaveClass('dark')
  })
})

describe('stored theme script with hostile options', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('light', 'dark')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    Reflect.deleteProperty(globalThis, 'injected')
  })

  it('treats every option as data', () => {
    const getItem = vi.fn<(key: string) => string | null>(() => 'dark')
    vi.stubGlobal('localStorage', { getItem })
    const options: LocalStorageThemeOptions = {
      ...localOptions,
      storageKey: HOSTILE_TEXT,
      colors: { light: `light${HOSTILE_TEXT}`, dark: `dark${HOSTILE_TEXT}` }
    }
    const meta = appendMeta()
    execute(options)
    expect(getItem).toHaveBeenCalledExactlyOnceWith(HOSTILE_TEXT)
    expect(meta.content).toBe(options.colors.dark)
    expect(Reflect.get(globalThis, 'injected')).toBeUndefined()
  })
})
