import assert from 'node:assert/strict'

const REQUEST_TIMEOUT = 1000
const HTTP_OK = 200

type ThemeSmoke = {
  html: string
  response: Response
  origin: string
  mutation: string | undefined
}

export async function smokeTheme({
  html,
  response,
  origin,
  mutation
}: ThemeSmoke): Promise<void> {
  const themeScriptTag =
    /<script(?<attributes>[^>]*)>[^<]*prefers-color-scheme/u.exec(html)
  assert.ok(themeScriptTag, 'Theme script must exist')
  const nonce = /nonce="(?<value>[^"]+)"/u.exec(
    themeScriptTag.groups?.attributes ?? ''
  )?.groups?.value
  assert.ok(nonce, 'Theme script must carry a nonce')
  assert.ok(
    response.headers
      .get('content-security-policy')
      ?.includes(`'nonce-${nonce}'`),
    'Theme nonce must match CSP'
  )
  const rootTag = /<html[^>]*>/u.exec(html)?.[0] ?? ''
  assert.doesNotMatch(
    rootTag,
    /class="[^"]*\b(?:light|dark)\b/u,
    'System theme must not emit an SSR theme class'
  )
  const dark = await fetch(`${origin}/fr`, {
    headers: { cookie: 'scenario-theme=dark' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  })
  assert.equal(dark.status, HTTP_OK)
  const darkHtml = await dark.text()
  assert.match(
    darkHtml,
    /<html[^>]*class="dark"/u,
    'Cookie must set dark class'
  )
  assert.ok(
    darkHtml.includes(
      `name="theme-color" content="${mutation === 'theme-color' ? '#wrong' : '#09090b'}"`
    ),
    'Dark theme-color must match configuration'
  )
}
