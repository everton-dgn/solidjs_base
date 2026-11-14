import { localizeHref } from '@evertondgn/solid-runtime/i18n/locale'
import { getRequestEvent, isServer } from '@solidjs/web'

import { m } from '../paraglide/messages.js'
import { getLocale } from '../paraglide/runtime.js'
import { readTheme, themeColor, themeScript, defaultTheme } from './theme.ts'

export default function App() {
  const event = isServer ? getRequestEvent() : undefined
  const theme =
    readTheme(
      isServer ? (event?.request.headers.get('cookie') ?? null) : undefined
    ) ?? defaultTheme
  const scriptNonce =
    typeof event?.nonce === 'string' ? event.nonce : event?.nonce?.script
  const nonce = scriptNonce === false ? undefined : scriptNonce
  return (
    <html lang={getLocale()} class={theme === 'system' ? undefined : theme}>
      <head>
        <title>Scenario application</title>
        <meta name="theme-color" content={themeColor(theme)} />
        <script nonce={nonce}>{themeScript(theme)}</script>
      </head>
      <body>
        <main>Scenario application</main>
        <p>{m.greeting()}</p>
        <a href={localizeHref('/about', { locale: 'fr' })}>About</a>
      </body>
    </html>
  )
}
