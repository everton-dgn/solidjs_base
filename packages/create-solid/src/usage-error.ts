import { message, type Language, type MessageKey } from './cli-language.ts'

type Problem = {
  field: string
  code: MessageKey
  values?: Record<string, string>
}
export class UsageError extends TypeError {
  public override name = 'UsageError'
}
export class ProfileProblemError extends UsageError {
  public override name = 'ProfileProblemError'
  public readonly field: string
  public readonly code: MessageKey
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
