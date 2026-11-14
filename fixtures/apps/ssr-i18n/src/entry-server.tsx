import { renderToStream } from '@solidjs/web'
import manifest from 'virtual:solid-manifest'

import App from './App.tsx'

export function render() {
  return renderToStream(() => <App />, { manifest })
}
