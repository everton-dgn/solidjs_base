import {
  THEME_STORAGE_KEY,
  localOptions
} from '../../../tests/theme/local-config.ts'
import { storedThemeScript } from '../index.js'

function blocked(): never {
  throw new Error('blocked')
}

function runScript(): HTMLMetaElement {
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  document.head.append(meta)
  onTestFinished(() => meta.remove())
  // oxlint-disable-next-line no-new-func, typescript/no-unsafe-call, typescript/no-implied-eval -- Execute the generated script as a browser would.
  new Function(storedThemeScript(localOptions))()
  return meta
}

describe('stored theme script', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('light', 'dark')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'light']
  ] as const)('applies the stored %s choice as %s', (stored, resolved) => {
    localStorage.setItem(THEME_STORAGE_KEY, stored)
    const meta = runScript()
    expect(document.documentElement).toHaveClass(resolved)
    expect(document.documentElement.style.colorScheme).toBe(resolved)
    expect(meta.content).toBe(localOptions.colors[resolved])
  })

  it('follows the system preference without a valid choice', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    runScript()
    expect(document.documentElement).toHaveClass('dark')
  })

  it('falls back to the default theme when storage is blocked', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    vi.stubGlobal('localStorage', { getItem: blocked })
    runScript()
    expect(document.documentElement).toHaveClass('light')
  })
})
