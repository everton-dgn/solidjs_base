import { localizeHref } from '@evertondgn/solid-runtime/i18n/locale'

import { m } from '../paraglide/messages.js'
import { getLocale } from '../paraglide/runtime.js'

export default function App() {
  return (
    <html lang={getLocale()}>
      <head>
        <title>Scenario application</title>
      </head>
      <body>
        <main>Scenario application</main>
        <p>{m.greeting()}</p>
        <a href={localizeHref('/about', { locale: 'fr' })}>About</a>
      </body>
    </html>
  )
}
