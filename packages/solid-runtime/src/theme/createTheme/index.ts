import {
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  untrack
} from 'solid-js'

import { applyTheme } from '../applyTheme/index.ts'
import { isTheme } from '../isTheme/index.ts'
import { makeSystemTheme } from '../makeSystemTheme/index.ts'
import { makeThemeChannel } from '../makeThemeChannel/index.ts'
import { saveTheme } from '../themeStorage/index.ts'
import type { ResolvedTheme, Theme, ThemeOptions } from '../types.ts'
import type { ThemeState } from './types.ts'

export function createTheme(options: ThemeOptions): ThemeState {
  const apply = (resolved: ResolvedTheme): void => {
    applyTheme({ theme: resolved, color: options.colors[resolved] })
  }
  const [themePreference, setThemePreference] = createSignal<Theme>(
    options.defaultTheme
  )
  const [systemTheme, setSystemTheme] = createSignal<ResolvedTheme>('light')
  const [isReady, setIsReady] = createSignal(false)

  const resolvedTheme = createMemo(() => {
    const current = themePreference()
    return current === 'system' ? systemTheme() : current
  })

  let connection: ReturnType<typeof makeThemeChannel> | undefined

  createEffect(
    () => (isReady() ? resolvedTheme() : null),
    resolved => {
      if (resolved) apply(resolved)
    }
  )

  onSettled(() => {
    const system = makeSystemTheme(setSystemTheme)
    connection = makeThemeChannel(options, setThemePreference)
    setIsReady(true)
    return () => {
      connection?.dispose()
      connection = undefined
      system.dispose()
    }
  })

  return {
    theme: themePreference,
    resolvedTheme,
    isReady,
    setTheme(next) {
      if (!isTheme(next)) return
      setThemePreference(next)
      apply(next === 'system' ? untrack(systemTheme) : next)
      const isPersisted = saveTheme(options, next)
      connection?.publish({ theme: next, isPersisted })
    }
  }
}
