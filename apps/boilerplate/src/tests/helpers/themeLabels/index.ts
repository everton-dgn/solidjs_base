import { m } from '@paraglide/messages.js'

import { testLanguages } from '../testLanguages/index.ts'

const options = { locale: testLanguages.alternate }
export const themeLabels = {
  theme: m.themeToggle_select({}, options),
  dark: m.themeToggle_dark({}, options),
  light: m.themeToggle_light({}, options),
  system: m.themeToggle_system({}, options)
}
