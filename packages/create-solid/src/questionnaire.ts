import path from 'node:path'
import type { Writable, Readable } from 'node:stream'
import { styleText } from 'node:util'

import { MultiSelectPrompt, wrapTextWithPrefix } from '@clack/core'
import {
  type CommonOptions,
  confirm,
  intro,
  isCancel,
  log,
  symbol,
  symbolBar,
  formatInstructionFooter,
  S_BAR,
  S_CHECKBOX_SELECTED,
  S_CHECKBOX_INACTIVE,
  select,
  text
} from '@clack/prompts'

import manifest from '../package.json' with { type: 'json' }
import { messages, type Language } from './cli-language.ts'
import { defaultSiteUrl } from './constants/site-url.ts'
import { fieldMessage } from './fieldMessage/index.ts'
import { installers } from './profile-answers.ts'
import { questionnaireBase } from './resolve-locale-options.ts'
import { hasTool, hasRepository, missingTool } from './tools.ts'
import type { Answers } from './types.ts'
import { CanceledError } from './usage-error.ts'
import { validateProfile } from './validateProfile/index.ts'

type FieldOptions = {
  key: 'name' | 'title' | 'locales' | 'base-locale' | 'site-url'
  initialValue: string
}

function answer<T extends string | boolean | string[]>(value: T | symbol): T {
  if (isCancel(value) || typeof value === 'symbol') throw new CanceledError()
  return value
}

type SessionOutput = Writable & { hasColors?: (count: number) => boolean }

type Session = {
  answers: Answers
  language: Language
  input: Readable
  output: SessionOutput
  hasColor: boolean
}

type SetupRecovery = { result: Answers; language: Language; io: CommonOptions }
async function recoverSetup({ result, language, io }: SetupRecovery) {
  const labels = messages[language]
  while (!result['no-git'] && !hasRepository(result.name) && !hasTool('git')) {
    result['no-git'] = !answer<boolean>(
      await confirm({
        ...io,
        message: missingTool({ tool: 'git', language }),
        active: labels.retry,
        inactive: labels.withoutGit
      })
    )
    if (result['no-git']) delete result.git
  }
  while (!result['no-install']) {
    const manager = installers.find(pm => pm === result.pm) ?? 'bun'
    if (hasTool(manager)) break
    const selected = answer<string>(
      await select({
        ...io,
        message: missingTool({ tool: manager, language }),
        showInstructions: false,
        options: [
          ...installers.map(value => ({
            value,
            label: hasTool(value) ? value : `${value} · ${labels.unavailable}`
          })),
          { value: 'skip', label: labels.skipInstall }
        ]
      })
    )
    if (selected === 'skip') {
      result['no-install'] = true
      delete result.install
    } else result.pm = selected
  }
}

type FeatureOption = { value: string; label: string; hint: string }
function renderFeatures({
  output,
  language
}: Pick<Session, 'output' | 'language'>) {
  const labels = messages[language]
  return function render(this: MultiSelectPrompt<FeatureOption>) {
    const heading = `${symbol(this.state)}  ${labels.features}`
    const bar = symbolBar(this.state) ?? styleText('gray', S_BAR)
    const selected = this.value ?? []
    if (this.state === 'submit' || this.state === 'cancel') {
      const list = this.options
        .filter(item => selected.includes(item.value))
        .map(item => item.label)
        .join(', ')
      return [
        styleText('gray', S_BAR),
        heading,
        wrapTextWithPrefix(
          output,
          styleText('dim', list),
          `${styleText('gray', S_BAR)}  `
        )
      ].join('\n')
    }
    const rows = this.options.map((item, index) => {
      const mark = selected.includes(item.value)
        ? S_CHECKBOX_SELECTED
        : S_CHECKBOX_INACTIVE
      const cursor = index === this.cursor ? '>' : ' '
      const hint = item.hint ? ` (${item.hint})` : ''
      return `${bar} ${cursor}${mark} ${item.label}${hint}`
    })
    return [
      styleText('gray', S_BAR),
      heading,
      ...rows,
      ...formatInstructionFooter(output, [labels.featureKeys], true)
    ].join('\n')
  }
}

function openQuestionnaire({
  output,
  input,
  hasColor,
  language
}: Omit<Session, 'answers'>) {
  const trueColorCount = 16_777_216
  const solidBlue = output.hasColors?.(trueColorCount)
    ? '\u001B[38;2;68;107;158m'
    : '\u001B[38;5;67m'
  const name = hasColor ? `${solidBlue}Solid Base\u001B[0m` : 'Solid Base'
  intro(`${name} v${manifest.version}`, { output, input })
  log.message(messages[language].tagline, { output, spacing: 0 })
}
function reportMissingTools({ result, language, io }: SetupRecovery) {
  const labels = messages[language]
  const availableManagers = new Set(installers.filter(tool => hasTool(tool)))
  const requestedManager = installers.find(pm => pm === result.pm) ?? 'bun'
  if (!availableManagers.has('bun')) log.warn(labels.missingBun, io)
  if (
    requestedManager !== 'bun' &&
    !availableManagers.has(requestedManager) &&
    !result['no-install']
  ) {
    log.warn(missingTool({ tool: requestedManager, language }), io)
  }
  if (!result['no-git'] && !hasRepository(result.name) && !hasTool('git')) {
    log.warn(missingTool({ tool: 'git', language }), io)
  }
  return availableManagers
}
export async function questionnaire({
  answers,
  language,
  input,
  output,
  hasColor
}: Session): Promise<Answers> {
  const labels = messages[language]
  const io = { input, output }
  const result = { ...answers }
  openQuestionnaire({ output, input, hasColor, language })
  const availableManagers = reportMissingTools({ result, language, io })
  const toggle = async (message: string) =>
    answer<boolean>(
      await confirm({ ...io, message, active: labels.yes, inactive: labels.no })
    )
  const field = async ({ key, initialValue }: FieldOptions) => {
    const names = {
      name: labels.dir,
      title: labels.title,
      locales: result.mode === 'client' ? labels.appLanguage : labels.locales,
      'base-locale': result['no-i18n'] ? labels.appLanguage : labels.base,
      'site-url': labels.url
    }
    if (result[key] !== undefined) return
    result[key] = answer<string>(
      await text({
        ...io,
        message: names[key],
        placeholder: initialValue,
        defaultValue: initialValue,
        validate(value) {
          const problem = validateProfile({
            ...result,
            [key]: value === '' ? initialValue : (value ?? initialValue)
          }).problems.find(
            item =>
              item.field.replace(/^--/u, '') ===
                (key === 'name' ? 'dir' : key) ||
              (key === 'locales' && item.code === 'membership')
          )
          return (
            problem &&
            fieldMessage({
              language,
              code: problem.code,
              values: problem.values
            })
          )
        }
      })
    )
  }
  await field({ key: 'name', initialValue: 'solid-app' })
  await field({
    key: 'title',
    initialValue: path.basename(path.resolve(result.name ?? 'solid-app'))
  })
  async function chooseMode() {
    if (result.mode === undefined) {
      const modes =
        result.seo || result['site-url'] || result.locales?.includes(',')
          ? (['server', 'static'] as const)
          : (['server', 'static', 'client'] as const)
      result.mode = answer<string>(
        await select({
          ...io,
          message: labels.mode,
          showInstructions: false,
          options: modes.map(value => ({
            value,
            label: labels[value],
            hint: labels[`${value}Hint`]
          }))
        })
      )
    }
  }
  async function chooseLanguages() {
    if (!result.i18n && !result['no-i18n'] && result.locales === undefined) {
      result['no-i18n'] = !(await toggle(labels.i18n))
    }
    const { defaults } = validateProfile(result)
    const initialBase = questionnaireBase({ language, defaults })
    if (result.mode === 'client') {
      const key = result['no-i18n'] ? 'base-locale' : 'locales'
      if (key === 'locales' && result['base-locale']) {
        result.locales ??= result['base-locale']
      }
      if (!result[key]) {
        log.message(labels.singleLanguage, { ...io, spacing: 0 })
      }
      await field({ key, initialValue: initialBase })
      if (result.locales) result['base-locale'] ??= result.locales
      return
    }
    if (!result['no-i18n']) {
      await field({ key: 'locales', initialValue: defaults.locales.join(',') })
      if (result.locales && !result.locales.includes(',')) {
        result['base-locale'] ??= result.locales
      }
    }
    if (result['no-i18n']) {
      await field({ key: 'base-locale', initialValue: initialBase })
      return
    }
    if (!result['base-locale']) {
      const { locales, baseLocale } = validateProfile(result).languages
      result['base-locale'] = answer<string>(
        await select({
          ...io,
          message: labels.base,
          showInstructions: false,
          initialValue: questionnaireBase({
            language,
            defaults: { locales, baseLocale }
          }),
          options: locales.map(value => ({ value }))
        })
      )
    }
  }
  async function chooseFeatures() {
    const keys = (
      ['seo', 'theme', 'icons', 'fonts', 'diagnostics'] as const
    ).filter(
      key =>
        result[key] === undefined &&
        result[`no-${key}`] === undefined &&
        (key !== 'seo' ||
          (result.mode !== 'client' && result['site-url'] === undefined))
    )
    if (keys.length > 0) {
      const chosen = answer<string[]>(
        (await new MultiSelectPrompt<FeatureOption>({
          ...io,
          required: false,
          initialValues: keys,
          options: keys.map(value => ({
            value,
            label: labels[value],
            hint: value === 'fonts' ? labels.fontHint : ''
          })),
          render: renderFeatures({ output, language })
        }).prompt()) ?? []
      )
      for (const key of keys) result[`no-${key}`] = !chosen.includes(key)
    }
    if (result.mode !== 'client' && !result['no-seo']) {
      await field({ key: 'site-url', initialValue: defaultSiteUrl })
    }
  }
  async function customize() {
    await chooseFeatures()
    await chooseLanguages()
    result.pm ??= answer<string>(
      await select({
        ...io,
        message: labels.installer,
        showInstructions: false,
        options: installers.map(value => {
          const hint = value === 'bun' ? labels.bunHint : labels.installHint
          return {
            value,
            label: availableManagers.has(value)
              ? value
              : `${value} · ${labels.unavailable}`,
            hint
          }
        })
      })
    )
    for (const key of ['git', 'install'] as const) {
      if (!result[key] && !result[`no-${key}`]) {
        result[`no-${key}`] = !(await toggle(labels[key]))
      }
    }
  }
  await chooseMode()
  const setup = answer(
    await select({
      ...io,
      message: labels.setup,
      showInstructions: false,
      options: [
        { value: 'recommended', label: labels.recommended },
        { value: 'custom', label: labels.custom }
      ]
    })
  )
  if (setup === 'custom') await customize()
  await recoverSetup({ result, language, io })
  return result
}
