import { options } from '../../../tests/theme/config.ts'
import { defineTheme } from '../index.ts'

describe('pre-hydration theme script', () => {
  it.each(['light', 'dark', 'system'] as const)(
    'applies %s and its color',
    theme => {
      const configured = defineTheme(options)
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.append(meta)
      onTestFinished(() => meta.remove())
      vi.stubGlobal('matchMedia', () => ({ matches: true }))
      // oxlint-disable-next-line no-new-func, typescript/no-unsafe-call, typescript/no-implied-eval -- Execute the generated inline script as a browser would.
      new Function(configured.themeScript(theme))()
      const resolved = theme === 'light' ? 'light' : 'dark'
      expect(document.documentElement.classList.contains(resolved)).toBe(true)
      expect(meta.content).toBe(options.colors[resolved])
    }
  )
})
