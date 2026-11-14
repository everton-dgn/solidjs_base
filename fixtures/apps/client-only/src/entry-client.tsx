import { getLocale } from '@evertondgn/solid-runtime/i18n/locale'
import { render } from '@solidjs/web'

render(
  () => <main lang={getLocale()}>Scenario application</main>,
  document.body
)
