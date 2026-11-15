import { configureServerErrors } from '@evertondgn/solid-runtime/server/configure-server-errors'
import { m } from '@paraglide/messages.js'
import { isLocale } from '@paraglide/runtime.js'

configureServerErrors({
  publicMessage: locale => {
    if (locale === 'it') throw new Error('CALLBACK_PRIVATE_SCENARIO')
    if (!isLocale(locale)) throw new Error('Unsupported locale')
    return m.configureServerErrors_message({}, { locale })
  }
})
