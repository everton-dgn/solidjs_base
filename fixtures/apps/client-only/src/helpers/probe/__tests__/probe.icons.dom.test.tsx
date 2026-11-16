import { render } from '@solidjs/web'
import { Github } from 'icon:hugeicons'
import IconMark from 'icon:scenario/mark'
import { describe, expect, it, onTestFinished } from 'vite-plus/test'

describe('packaged icons', () => {
  it('hides the icons of a folder and of an installed collection from assistive technology', () => {
    const host = document.createElement('div')
    document.body.append(host)
    onTestFinished(() => host.remove())
    const dispose = render(
      () => (
        <>
          <IconMark />
          <Github />
        </>
      ),
      host
    )
    onTestFinished(dispose)
    const icons = [...host.querySelectorAll('svg')]
    expect(icons.map(icon => icon.getAttribute('aria-hidden'))).toStrictEqual([
      'true',
      'true'
    ])
  })
})
