import { editTemplate } from './edit-template.ts'
import type { Profile } from './types.ts'

type TemplateRule = readonly [pattern: string | RegExp, replacement: string]
type ProfileRules = ProfileText & { groups: readonly ProfileRuleGroup[] }
const features = ['hasI18n', 'hasSeo', 'hasTheme'] as const

export type ProfileText = { file: string; text: string; profile: Profile }
export type ProfileRuleGroup = {
  files: readonly string[]
  modes?: readonly NonNullable<Profile['mode']>[]
  hasI18n?: boolean
  hasSeo?: boolean
  hasTheme?: boolean
  expectedMatches?: number
  rules: readonly TemplateRule[]
}

export function applyProfileRules({
  file,
  text,
  profile,
  groups
}: ProfileRules): string {
  let result = text
  for (const group of groups) {
    if (!group.files.includes(file)) continue
    if (group.modes && !group.modes.includes(profile.mode ?? 'server')) continue
    const hasMatchingFeatures = features.every(
      key => group[key] === undefined || group[key] === (profile[key] !== false)
    )
    if (hasMatchingFeatures) {
      for (const [pattern, replacement] of group.rules) {
        result = editTemplate({
          file,
          text: result,
          pattern,
          replacement,
          expectedMatches: group.expectedMatches ?? 1
        })
      }
    }
  }
  return result
}
