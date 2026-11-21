import { message, type Language } from '../cli-language.ts'
import { shellDirectory } from '../shellDirectory/index.ts'
import type { Profile } from '../types.ts'
import { CanceledError, ReportedInstallError } from '../usage-error.ts'

type InstallOptions = {
  profile: Profile
  language: Language
  shouldRetryGit?: boolean
}
export function resumeSteps({
  profile,
  language,
  shouldRetryGit
}: InstallOptions): string {
  const dir = shellDirectory(profile.dir)
  return [
    message(language, { code: 'resume', values: { dir } }),
    `cd ${dir}`,
    ...(shouldRetryGit ? ['git init'] : []),
    ...(profile.shouldInstall ? [`${profile.pm} install`] : [])
  ].join('\n')
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
