import { prepareClientLocale } from '@evertondgn/solid-runtime/i18n/prepare-client-locale'
import { hydrate } from '@solidjs/web'

import App from './App.tsx'

const locale = prepareClientLocale()
if (locale.shouldHydrate) hydrate(() => <App />, document)
if (import.meta.hot) import.meta.hot.dispose(locale.dispose)
