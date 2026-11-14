import 'server-only'
import { markSafeError } from '@solidjs/web'

import { publicErrorMessage as resolveMessage } from '../publicMessage/index.ts'

const errors = new WeakSet<object>()

export function publicErrorMessage(locale?: string): string {
  return resolveMessage(locale)
}

export function createPublicError(): Error {
  const error = markSafeError(new Error(publicErrorMessage()))
  errors.add(error)
  return error
}

export function isPublicError(value: unknown): boolean {
  return typeof value === 'object' && value !== null && errors.has(value)
}
