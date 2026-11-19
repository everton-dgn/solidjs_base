import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'

import { resolveAppTitle } from './configureAppTitle/index.ts'
import { readLocaleSettings } from './configureLocales/catalogs.ts'
import {
  answerProfile,
  modes,
  installers,
  switches,
  type Answers
} from './profile-answers.ts'
import { resolveLocaleOptions } from './resolve-locale-options.ts'
import type { Profile, LocaleSettings } from './types.ts'
import { ProfileProblemError } from './usage-error.ts'

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

export function validateProfile(input: Profile | Answers): {
  profile: Profile
  problems: ProfileProblemError[]
  title: string
  defaults: LocaleSettings
  languages: LocaleSettings
  siteUrl: URL | undefined
} {
  const profile = 'dir' in input ? input : answerProfile(input)
  const problems = choiceProblems(input)
  if (
    !profile.dir.trim() ||
    (existsSync(profile.dir) &&
      (!statSync(profile.dir).isDirectory() ||
        readdirSync(profile.dir).length > 0))
  ) {
    problems.push(
      new ProfileProblemError({ field: 'dir', code: 'destination' })
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
    path.resolve(import.meta.dirname, '../template')
  )
  const languages = resolveLocaleOptions(
    { options: profile, defaults },
    problems
  )
  return { profile, problems, defaults, title, languages, siteUrl }
}
