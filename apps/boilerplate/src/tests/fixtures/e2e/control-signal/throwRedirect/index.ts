import { localizedRedirect } from '@evertondgn/solid-runtime/i18n/localized-redirect'

// Sinal de controle lançado numa chamada direta durante o SSR. O runtime
// informa esse throw ao hook de erros, que precisa deixá-lo passar.
export async function throwRedirect(): Promise<never> {
  'use server'
  await Promise.resolve()
  // oxlint-disable-next-line typescript/only-throw-error -- O Solid usa Response como sinal de redirecionamento.
  throw localizedRedirect({ href: '/?from=control-signal' })
}
