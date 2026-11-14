import { createRenderOptions } from '@evertondgn/solid-runtime/server/create-render-options'
import { getRequestEvent, renderToStream } from '@solidjs/web'
import manifest from 'virtual:solid-manifest'

import App from './App.tsx'
import { renderServerError } from './infra/server/renderServerError/index.tsx'

export function render() {
  const options = { manifest, ...createRenderOptions() }
  const event = getRequestEvent()
  if (event && new URL(event.request.url).pathname.endsWith('/server-error')) {
    return renderToStream(() => renderServerError(event), options)
  }
  return renderToStream(() => <App />, options)
}
