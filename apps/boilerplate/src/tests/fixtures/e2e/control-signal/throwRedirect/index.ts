import { localizedRedirect } from '@evertondgn/solid-runtime/i18n/localized-redirect'

// Control signal thrown in a direct call during the SSR. The runtime reports that
// throw to the error hook, which must let it through.
export async function throwRedirect(): Promise<never> {
  'use server'
  await Promise.resolve()
  // oxlint-disable-next-line typescript/only-throw-error -- Solid uses Response as a redirect signal.
  throw localizedRedirect({ href: '/?from=control-signal' })
}
