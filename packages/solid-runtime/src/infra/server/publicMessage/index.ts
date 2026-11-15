import 'server-only'
import { getLocale } from '../../../i18n/locale/index.ts'

const DEFAULT_MESSAGE = 'The request could not be completed.'
let message: PublicMessage | undefined

// Internal setter: only configureServerErrors may import it.
export function configurePublicMessage(publicMessage?: PublicMessage): void {
  message = publicMessage
}

export function publicErrorMessage(locale?: string): string {
  if (!message) return DEFAULT_MESSAGE
  try {
    const result = message(locale ?? getLocale())
    return typeof result === 'string' && result.length > 0
      ? result
      : DEFAULT_MESSAGE
  } catch {
    return DEFAULT_MESSAGE
  }
}

export type PublicMessage = (locale: string) => string
