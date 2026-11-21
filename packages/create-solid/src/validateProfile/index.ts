import { existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { resolveAppTitle } from '../configureAppTitle/index.ts'
import { readLocaleSettings } from '../configureLocales/catalogs.ts'
import { isDestinationEntry } from '../isDestinationEntry/index.ts'
import { distribution } from '../paths.ts'
import {
  answerProfile,
  modes,
  installers,
  switches
} from '../profile-answers.ts'
import { resolveLocaleOptions } from '../resolve-locale-options.ts'
import type { Answers, Profile, LocaleSettings } from '../types.ts'
import { ProfileProblemError } from '../usage-error.ts'

function choiceProblems(input: Answers | Profile) {
  const problems: ProfileProblemError[] = []
  for (const [field, choices] of [
    ['mode', modes],
    ['pm', installers]
  ] as const) {
    if (
      input[field] !== undefined &&
      !choices.some(value => value === input[field])
    ) {
      problems.push(
        new ProfileProblemError({
          field,
          code: 'invalid',
          values: { flag: `--${field}` }
        })
      )
    }
  }
  if (!('dir' in input)) {
    for (const value of switches) {
      if (input[value] && input[`no-${value}`]) {
        problems.push(
          new ProfileProblemError({
            field: value,
            code: 'conflict',
            values: { value }
          })
        )
      }
    }
  }
  return problems
}

type ValidatedProfile = {
  profile: Profile
  problems: ProfileProblemError[]
  title: string
  defaults: LocaleSettings
  languages: LocaleSettings
  siteUrl: URL | undefined
}
export function validateProfile(input: Profile | Answers): ValidatedProfile {
  const profile = 'dir' in input ? input : answerProfile(input)
  const problems = choiceProblems(input)
  if (!profile.dir.trim()) {
    problems.push(
      new ProfileProblemError({ field: 'dir', code: 'destination' })
    )
  }
  if (
    existsSync(profile.dir) &&
    (!statSync(profile.dir).isDirectory() ||
      readdirSync(profile.dir).some(name => isDestinationEntry(name)))
  ) {
    const dir = 'dir' in input ? input.dir : (input.name ?? profile.dir)
    problems.push(
      new ProfileProblemError({
        field: 'dir',
        code: 'occupied',
        values: { dir }
      })
    )
  }
  let title = ''
  try {
    title = resolveAppTitle(profile)
  } catch (error) {
    if (!(error instanceof ProfileProblemError)) throw error
    problems.push(error)
  }
  if (profile.mode === 'client' && profile.hasSeo) {
    problems.push(new ProfileProblemError({ field: 'seo', code: 'clientSeo' }))
  }
  const hasSeo = profile.mode !== 'client' && profile.hasSeo !== false
  let siteUrl
  if (hasSeo) {
    siteUrl = URL.parse(profile.siteUrl ?? 'https://example.com') ?? undefined
    if (
      !siteUrl ||
      !['http:', 'https:'].includes(siteUrl.protocol) ||
      siteUrl.href !== `${siteUrl.origin}/`
    ) {
      problems.push(
        new ProfileProblemError({ field: 'site-url', code: 'origin' })
      )
    }
  } else if (profile.siteUrl !== undefined) {
    problems.push(
      new ProfileProblemError({ field: 'site-url', code: 'needsSeo' })
    )
  }
  const defaults = readLocaleSettings(
    fileURLToPath(new URL('../template/', distribution))
  )
  const languages = resolveLocaleOptions(
    { options: profile, defaults },
    problems
  )
  return { profile, problems, defaults, title, languages, siteUrl }
}
