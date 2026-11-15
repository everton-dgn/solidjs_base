import { createLocalizedNavigate } from '@evertondgn/solid-runtime/i18n/create-localized-navigate'
import { localeTag } from '@evertondgn/solid-runtime/i18n/locale-tag'
import { useLocation } from '@solidjs/router'

export default function App() {
  const navigate = createLocalizedNavigate()
  const location = useLocation()
  return (
    <main lang={localeTag()}>
      Scenario application
      <button
        type="button"
        onClick={() =>
          navigate({ href: '/about?q=1#part', state: { source: 'button' } })
        }
      >
        About
      </button>
      <output data-state={JSON.stringify(location.state)}>
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
    </main>
  )
}
