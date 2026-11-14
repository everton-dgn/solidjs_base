import { prepareClientLocale } from '@evertondgn/solid-runtime/i18n/prepare-client-locale'
import { hydrate } from '@solidjs/web'
import { onHydrationEnd } from 'solid-js'

import App from './App.tsx'
import Document from './Document.tsx'
import { installOutdatedPageDetection } from './entry-client/installOutdatedPageDetection/index.ts'

const locale = prepareClientLocale()
if (locale.shouldHydrate) {
  const disposeOutdatedPageDetection = installOutdatedPageDetection()
  // Vite keeps one dispose callback per module.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      disposeOutdatedPageDetection()
      locale.dispose()
    })
  }

  hydrate(() => {
    const tree = (
      <Document>
        <App />
      </Document>
    )
    // The async entry may pause hydration until the shell is complete.
    onHydrationEnd(() => {
      document.documentElement.dataset.hydrationEnded = ''
    })
    return tree
  }, document)
}
