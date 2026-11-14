import { createRenderOptions } from '@evertondgn/solid-runtime/server/create-render-options'
import { renderToStream } from '@solidjs/web'
import manifest from 'virtual:solid-manifest'

import App from './App.tsx'
import Document from './Document.tsx'

export function render() {
  const options = createRenderOptions()
  return renderToStream(
    () => (
      <Document>
        <App />
      </Document>
    ),
    {
      manifest,
      ...options
    }
  )
}
