import { render } from '@solidjs/web'

import { FontLinks } from '../index.tsx'

vi.mock(import('virtual:solid-app/fonts'), () => ({
  stylesheet: '/assets/solid-fonts-fixture.css',
  preloads: [{ href: '/assets/fixture.woff2', type: 'font/woff2' }]
}))

function renderLinks(): HTMLDivElement {
  const host = document.createElement('div')
  const dispose = render(() => <FontLinks />, host)
  onTestFinished(dispose)
  return host
}

describe('font links', () => {
  it('renders an external stylesheet without inline CSS', () => {
    const host = renderLinks()
    expect(host.querySelector('link[rel="stylesheet"]')).toHaveAttribute(
      'href',
      '/assets/solid-fonts-fixture.css'
    )
    expect(host.querySelector('style, [style]')).toBeNull()
  })

  it('renders anonymous font preloads with the configured URL and MIME type', () => {
    const font = renderLinks().querySelector('link[rel="preload"]')
    expect(font).toHaveAttribute('href', '/assets/fixture.woff2')
    expect(font).toHaveAttribute('as', 'font')
    expect(font).toHaveAttribute('type', 'font/woff2')
    expect(font).toHaveAttribute('crossorigin', 'anonymous')
  })
})
