import { FontLinks } from '@evertondgn/solid-runtime/fonts/font-links'
import { getRequestEvent, HydrationScript, isServer } from '@solidjs/web'
import type { ParentProps } from 'solid-js'

import { SITE } from '@/constants/site/index.ts'
import {
  DEFAULT_THEME,
  readTheme,
  themeColor,
  themeScript
} from '@/constants/theme.ts'

export default function Document(props: ParentProps) {
  const event = isServer ? getRequestEvent() : undefined
  const cookieHeader = isServer
    ? (event?.request.headers.get('cookie') ?? null)
    : undefined
  // O navegador oculta o nonce após validar o script; no cliente não há evento de requisição.
  const scriptNonce =
    typeof event?.nonce === 'string' ? event.nonce : event?.nonce?.script
  const nonce = scriptNonce === false ? undefined : scriptNonce
  const theme = readTheme(cookieHeader) ?? DEFAULT_THEME
  const explicitTheme = theme === 'system' ? undefined : theme

  return (
    <html lang={SITE.locale} class={explicitTheme}>
      <head>
        <meta charset="utf-8" />
        <title>{SITE.title}</title>
        <meta name="author" content={SITE.author.name} />
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width"
        />
        <meta
          name="format-detection"
          content="telephone=no,email=no,address=no,date=no,url=no"
        />
        <meta name="theme-color" content={themeColor(theme)} />
        <link rel="describedby" href="/llms.txt" />
        <script nonce={nonce}>{themeScript(theme)}</script>
        <FontLinks />
        <link rel="icon" href="/favicon/favicon.ico" sizes="16x16 32x32" />
        <link
          rel="icon"
          href="/favicon/favicon.svg"
          type="image/svg+xml"
          sizes="any"
        />
        <link
          rel="apple-touch-icon"
          href="/favicon/apple-touch-icon.png"
          sizes="180x180"
        />
        <HydrationScript />
        {/* Com entries autorais o plugin não injeta a entrada do cliente: ele
        troca este caminho literal pelo asset com hash no build. */}
        <script type="module" src="/src/entry-client.tsx" async nonce={nonce} />
      </head>
      <body>{props.children}</body>
    </html>
  )
}
