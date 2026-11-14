import { localizeHref } from '@evertondgn/solid-runtime/i18n/urls'
import { redirect } from '@solidjs/web'

import { waitFixtureGate } from '../../backend/waitFixtureGate/index.ts'

// Redirect decidido depois do envio do shell: o gate, liberado pelo teste,
// mantém o Loading pendente, e o runtime só pode seguir o Location pelo script
// de fallback.
export async function throwLateRedirect(id: string): Promise<never> {
  'use server'
  await waitFixtureGate({ id, real: false })
  // oxlint-disable-next-line typescript/only-throw-error -- O Solid usa Response como sinal de redirecionamento.
  throw redirect(localizeHref({ href: '/?from=late-redirect' }))
}
