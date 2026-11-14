import type { ThemeState } from '@evertondgn/solid-runtime/theme/create-theme/types'
import { createContext } from 'solid-js'

export const ThemeContext = createContext<ThemeState>()
