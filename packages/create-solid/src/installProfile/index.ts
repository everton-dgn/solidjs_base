import { message, messages, type Language } from '../cli-language.ts'
import { shellDirectory } from '../shellDirectory/index.ts'
import type { Profile } from '../types.ts'
import { CanceledError, ReportedInstallError } from '../usage-error.ts'

type InstallOptions = {
  profile: Profile
  language: Language
  shouldRetryGit?: boolean
}
type RecoveryOptions = { dir: string; language: Language; commands: string[] }
export function recoveryInstructions({
  dir,
  language,
  commands
}: RecoveryOptions): string {
  const destination = shellDirectory(dir)
  return [
    ...(destination === '.'
      ? [messages[language].resumeHere]
      : [
          message(language, { code: 'resume', values: { dir: destination } }),
          `cd ${destination}`
        ]),
    ...commands
  ].join('\n')
}
export function resumeSteps({
  profile,
  language,
  shouldRetryGit
}: InstallOptions): string {
  return recoveryInstructions({
    dir: profile.dir,
    language,
    commands: [
      ...(shouldRetryGit ? ['git init'] : []),
      ...(profile.shouldInstall ? [`${profile.pm} install`] : [])
    ]
  })
}
export type SetupCommand = {
  task: 'gitTask' | 'installTask'
  executable: string
  args: string[]
}
export function* installProfile({
  profile,
  language,
  shouldRetryGit = false
}: InstallOptions): Generator<SetupCommand, void> {
  if (!profile.shouldInstall) return
  try {
    yield { task: 'installTask', executable: profile.pm, args: ['install'] }
  } catch (error) {
    const resume = resumeSteps({ profile, language, shouldRetryGit })
    if (error instanceof CanceledError) {
      throw new CanceledError(resume, { cause: error })
    }
    throw new Error(
      [
        error instanceof Error && !(error instanceof ReportedInstallError)
          ? error.message
          : '',
        resume
      ]
        .filter(Boolean)
        .join('\n\n'),
      { cause: error }
    )
  }
}
