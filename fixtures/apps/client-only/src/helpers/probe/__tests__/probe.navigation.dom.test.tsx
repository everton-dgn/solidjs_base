import { getLocale, setLocale } from '@evertondgn/solid-runtime/i18n/locale'
import { localeTag } from '@evertondgn/solid-runtime/i18n/locale-tag'
import { createRouter, memoryHistory } from '@solidjs/router'
import { render } from '@solidjs/web'
import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'

import App from '../../../App.tsx'

describe('single-language navigation', () => {
  it('keeps the configured language without reloading or changing the URL', async () => {
    const { href } = globalThis.location
    const reload = vi.spyOn(globalThis.location, 'reload')
    const assign = vi.spyOn(globalThis.location, 'assign')
    const replace = vi.spyOn(globalThis.location, 'replace')
    await setLocale('ja', { reload: true })
    expect({
      locale: getLocale(),
      tag: localeTag(),
      href: globalThis.location.href
    }).toStrictEqual({ locale: 'en', tag: 'en', href })
    expect(reload).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('navigates without a locale prefix and retains query, hash, state and history', async () => {
    const history = memoryHistory('/')
    const Router = createRouter({
      history,
      routes: [{ path: '*all', component: App }]
    })
    const host = document.createElement('div')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const dispose = render(
      () => <Router>{props => props.children}</Router>,
      host
    )
    onTestFinished(dispose)
    await expect.poll(() => host.querySelector('output')?.textContent).toBe('/')
    expect(host.querySelector('main')?.lang).toBe('en')
    host.querySelector('button')?.click()
    await expect
      .poll(() => host.querySelector('output')?.textContent)
      .toBe('/about?q=1#part')
    expect(host.querySelector('output')?.dataset.state).toBe(
      '{"source":"button"}'
    )
    history.back()
    await expect.poll(() => host.querySelector('output')?.textContent).toBe('/')
  })
})
