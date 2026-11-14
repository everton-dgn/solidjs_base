import { localizeHref } from '@evertondgn/solid-runtime/i18n/locale'

export default function App() {
  return (
    <html lang="en">
      <head>
        <title>Scenario application</title>
      </head>
      <body>
        <main>Scenario application</main>
        <a href={localizeHref('/about')}>About</a>
      </body>
    </html>
  )
}
