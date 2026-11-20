import { message, type Language } from './cli-language.ts'
import type { ValidationCode } from './field-messages.ts'

type Problem = {
  field: string
  code: ValidationCode
  values?: Record<string, string>
}
export class UsageError extends TypeError {
  public override name = 'UsageError'
}
export class ProfileProblemError extends UsageError {
  public override name = 'ProfileProblemError'
  public readonly field: string
  public readonly code: ValidationCode
  public readonly values: Record<string, string>
  public constructor({ field, code, values = {} }: Problem) {
    super(message('en', { code, values }))
    this.field = field
    this.code = code
    this.values = values
  }
  public describe(language: Language): string {
    return message(language, this)
  }
}

export class CanceledError extends Error {
  public override name = 'CanceledError'
}
