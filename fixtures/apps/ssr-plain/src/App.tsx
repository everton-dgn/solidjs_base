import { FontLinks } from '@evertondgn/solid-runtime/fonts/font-links'
import { getLocale, localizeHref } from '@evertondgn/solid-runtime/i18n/locale'
import { createSeo } from '@evertondgn/solid-runtime/seo/create-seo'
import { createRouter } from '@solidjs/router'
import { env } from 'virtual:solid-env/client'

import { site } from './seo-site.ts'

const Router = createRouter({
  routes: [
    {
      path: '/*rest',
      info: { seo: { title: 'Scenario page' } },
      component: () => (
        <main data-env={env.VITE_SCENARIO_LABEL}>Scenario application</main>
      )
    }
  ]
})

export default function App() {
  return (
    <Router>
      {props => {
        createSeo({ route: true, site })
        createSeo({
          structuredData: () => ({
            '@type': 'Thing',
            name: 'Fixture structured data'
          })
        })
        return (
          <html lang={getLocale()}>
            <head>
              <FontLinks />
              <title>Scenario application</title>
            </head>
            <body>
              {props.children}
              <a href={localizeHref('/about')}>About</a>
            </body>
          </html>
        )
      }}
    </Router>
  )
}
