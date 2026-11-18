import { localizeHref } from '@evertondgn/solid-runtime/i18n/urls'
import { redirect } from '@solidjs/web'

import { waitFixtureGate } from '../../backend/waitFixtureGate/index.ts'

// Redirect decided after the shell was sent: the gate, released by the test,
// keeps Loading pending, and the runtime can only follow the Location through
// the fallback script.
export async function throwLateRedirect(id: string): Promise<never> {
  'use server'
  await waitFixtureGate({ id, real: false })
  // oxlint-disable-next-line typescript/only-throw-error -- Solid uses Response as a redirect signal.
  throw redirect(localizeHref({ href: '/?from=late-redirect' }))
}
