import { localizeHref } from '@evertondgn/solid-runtime/i18n/locale'
import { env } from 'virtual:solid-env/client'

export default function App() {
  return (
    <html lang="en">
      <head>
        <title>Scenario application</title>
      </head>
      <body>
        <main data-env={env.VITE_SCENARIO_LABEL}>Scenario application</main>
        <a href={localizeHref('/about')}>About</a>
      </body>
    </html>
  )
}
