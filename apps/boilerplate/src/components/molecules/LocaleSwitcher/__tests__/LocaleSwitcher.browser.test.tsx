import { m } from '@paraglide/messages.js'
import { baseLocale } from '@paraglide/runtime.js'
import { createRouter, memoryHistory } from '@solidjs/router'
import { page } from 'vite-plus/test/browser/context'

import { renderComponent } from '@/tests/providers/renderComponent/index.tsx'

import '@/theme/globalStyles.css'

import { LOCALE_NAMES } from '../constants.ts'
import { LocaleSwitcher } from '../index.tsx'

function mountSwitcher() {
  const Router = createRouter({
    history: memoryHistory(`/${baseLocale}`),
    routes: [{ path: '*all', component: LocaleSwitcher }]
  })
  return renderComponent(() => <Router>{props => props.children}</Router>, {
    hasProviders: false
  })
}

describe('locale switcher', () => {
  it('includes the visible locale in the accessible name of the trigger', async () => {
    mountSwitcher()
    const code = baseLocale.toUpperCase()
    const name = m.localeSwitcher_select({ code }, { locale: baseLocale })
    const trigger = page.getByRole('button', { name })
    await expect.element(trigger).toHaveTextContent(code)
    await expect.element(trigger).toHaveAccessibleName(name)
    await trigger.click()
    const itemName = LOCALE_NAMES[baseLocale]
    await expect
      .element(page.getByRole('menuitemradio', { name: itemName }))
      .toHaveAttribute('aria-checked', 'true')
  })
})
