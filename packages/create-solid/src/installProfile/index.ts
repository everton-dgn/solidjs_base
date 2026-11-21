import { message, type Language } from '../cli-language.ts'
import type { Profile } from '../types.ts'
import { CanceledError } from '../usage-error.ts'

type InstallOptions = { profile: Profile; language: Language }
export type SetupCommand = {
  task: 'gitTask' | 'installTask'
  executable: string
  args: string[]
}
export function* installProfile({
  profile,
  language
}: InstallOptions): Generator<SetupCommand, void> {
  if (!profile.shouldInstall) return
  try {
    yield { task: 'installTask', executable: profile.pm, args: ['install'] }
  } catch (error) {
    const resume = message(language, {
      code: 'installFailure',
      values: { dir: profile.dir, pm: profile.pm }
    })
    if (error instanceof CanceledError) {
      throw new CanceledError(resume, { cause: error })
    }
    throw new Error(resume, { cause: error })
  }
}
