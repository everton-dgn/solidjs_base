import { localizeHref } from '@evertondgn/solid-runtime/i18n/locale'

import { baseLocale } from '../paraglide/runtime.js'

export default function App() {
  return (
    <html lang={baseLocale}>
      <head>
        <title>Scenario application</title>
      </head>
      <body>
        <main>Scenario application</main>
        <a href={localizeHref('/about', { locale: 'fr' })}>About</a>
      </body>
    </html>
  )
}
