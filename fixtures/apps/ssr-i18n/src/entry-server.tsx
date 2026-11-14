import { getRequestEvent, renderToStream } from '@solidjs/web'
import manifest from 'virtual:solid-manifest'

import App from './App.tsx'
import { renderServerError } from './infra/server/renderServerError/index.tsx'

export function render() {
  const event = getRequestEvent()
  if (event && new URL(event.request.url).pathname.endsWith('/server-error')) {
    return renderToStream(() => renderServerError(event), { manifest })
  }
  return renderToStream(() => <App />, { manifest })
}
