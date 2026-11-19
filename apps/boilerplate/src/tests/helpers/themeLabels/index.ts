import { m } from '@paraglide/messages.js'

import { testLocale } from '../testLocale/index.ts'

const options = { locale: testLocale.alternate }
export const themeLabels = {
  theme: m.themeToggle_select({}, options),
  dark: m.themeToggle_dark({}, options),
  light: m.themeToggle_light({}, options),
  system: m.themeToggle_system({}, options)
}
