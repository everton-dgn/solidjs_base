import { createRouter, memoryHistory, useLocation } from '@solidjs/router'

import { renderComponent } from '../../../tests/renderComponent/index.tsx'
import { createLocalizedNavigate } from '../index.ts'

describe('createLocalizedNavigate contracts', () => {
  it('resolves fragments and empty hrefs against the nested current page and query', async () => {
    let navigate: ReturnType<typeof createLocalizedNavigate> | undefined
    function Page() {
      navigate = createLocalizedNavigate()
      const location = useLocation()
      return (
        <output>
          {location.pathname}
          {location.search}
          {location.hash}
        </output>
      )
    }
    const Router = createRouter({
      history: memoryHistory('/de/docs/chapter?filter=active#old'),
      routes: [{ path: '*all', component: Page }]
    })
    const host = renderComponent(() => (
      <Router>{props => props.children}</Router>
    ))
    await expect
      .poll(() => host.textContent)
      .toBe('/de/docs/chapter?filter=active#old')
    assert(navigate)
    navigate({ href: '#section' })
    await expect
      .poll(() => host.textContent)
      .toBe('/de/docs/chapter?filter=active#section')
    navigate({ href: '' })
    await expect
      .poll(() => host.textContent)
      .toBe('/de/docs/chapter?filter=active')
  })

  it('navigates in the Router with query/hash, relative URLs, and state', async () => {
    const history = memoryHistory('/de/docs')
    let navigate: ReturnType<typeof createLocalizedNavigate> | undefined
    function Page() {
      navigate = createLocalizedNavigate()
      const location = useLocation()
      return (
        <output data-state={JSON.stringify(location.state)}>
          {location.pathname}
          {location.search}
          {location.hash}
        </output>
      )
    }
    const Router = createRouter({
      history,
      routes: [{ path: '*all', component: Page }]
    })
    const host = renderComponent(() => (
      <Router>{props => props.children}</Router>
    ))
    await expect.poll(() => host.textContent).toBe('/de/docs')
    assert(navigate)
    navigate({ href: '/docs/start' })
    await expect.poll(() => host.textContent).toBe('/de/docs/start')
    navigate({
      href: '../next?q=1#part',
      locale: 'de',
      state: { source: 'test' },
      replace: true
    })
    await expect.poll(() => host.textContent).toBe('/de/next?q=1#part')
    expect(host.querySelector('output')?.dataset.state).toBe(
      '{"source":"test"}'
    )
    history.back()
    await expect.poll(() => host.textContent).toBe('/de/docs')
    navigate({ href: '/ja/final', locale: 'de' })
    await expect.poll(() => host.textContent).toBe('/de/final')
  })

  it('uses document navigation for a different locale, external URLs, and endpoints', async () => {
    const assign = vi
      .spyOn(globalThis.location, 'assign')
      .mockImplementation(() => {
        /* Keep the test in its document. */
      })
    const replace = vi
      .spyOn(globalThis.location, 'replace')
      .mockImplementation(() => {
        /* Keep the test in its document. */
      })
    let navigate: ReturnType<typeof createLocalizedNavigate> | undefined
    function Page() {
      navigate = createLocalizedNavigate()
      return <p>Ready</p>
    }
    const Router = createRouter({
      history: memoryHistory('/de/docs'),
      routes: [{ path: '*all', component: Page }]
    })
    const host = renderComponent(() => (
      <Router>{props => props.children}</Router>
    ))
    await expect.poll(() => host.textContent).toBe('Ready')
    assert(navigate)
    navigate({ href: '/docs?q=1#part', locale: 'fr' })
    expect(assign).toHaveBeenLastCalledWith('/fr/docs?q=1#part')
    navigate({ href: '/api/report', shouldLocalize: false, replace: true })
    expect(replace).toHaveBeenCalledWith('/api/report')
    navigate({ href: 'https://example.com' })
    expect(assign).toHaveBeenLastCalledWith('https://example.com')
    navigate({ href: '//example.com/docs' })
    expect(assign).toHaveBeenLastCalledWith('//example.com/docs')
    navigate({ href: 'mailto:a@example.com' })
    expect(assign).toHaveBeenLastCalledWith('mailto:a@example.com')
  })
})
