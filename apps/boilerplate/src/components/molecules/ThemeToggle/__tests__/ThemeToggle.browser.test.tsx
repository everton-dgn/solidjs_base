import { m } from '@paraglide/messages.js'
import { page, userEvent } from 'vite-plus/test/browser/context'

import { readTheme } from '@/constants/theme.ts'
import { clearThemeCookie } from '@/tests/helpers/clearThemeCookie/index.ts'
import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import '@/theme/globalStyles.css'

import { ThemeToggle } from '../index.tsx'

describe('theme switcher', () => {
  beforeEach(clearThemeCookie)
  afterEach(clearThemeCookie)

  it('selects each preference and updates the accessible state', async () => {
    renderComponent(() => <ThemeToggle />)
    const trigger = page.getByRole('button')
    await expect
      .element(trigger)
      .toHaveAccessibleName(
        m.themeToggle_current({ theme: m.themeToggle_system() })
      )
    await expect.element(trigger).toBeEnabled()
    await userEvent.click(trigger)
    for (const [label, value] of [
      [m.themeToggle_dark(), 'dark'],
      [m.themeToggle_light(), 'light'],
      [m.themeToggle_system(), 'system']
    ] as const) {
      await userEvent.click(
        page.getByRole('menuitemradio', { name: label, exact: true })
      )
      await expect.poll(() => readTheme()).toBe(value)
      await expect
        .element(trigger)
        .toHaveAccessibleName(m.themeToggle_current({ theme: label }))
      await userEvent.click(trigger)
      await expect
        .element(page.getByRole('menuitemradio', { name: label, exact: true }))
        .toHaveAttribute('aria-checked', 'true')
    }
    await userEvent.keyboard('{Escape}')
  })
})
