import { render, type JSX } from '@solidjs/web'

export function renderComponent(component: () => JSX.Element): HTMLDivElement {
  const host = document.createElement('div')
  document.body.append(host)
  // Register first so the host is removed even when rendering throws.
  onTestFinished(() => host.remove())
  const dispose = render(component, host)
  onTestFinished(dispose)
  return host
}
