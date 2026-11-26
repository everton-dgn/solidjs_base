import path from 'node:path'
import type { Writable, Readable } from 'node:stream'
import { styleText } from 'node:util'

import {
  getColumns,
  getRows,
  MultiSelectPrompt,
  TextPrompt,
  wrapTextWithPrefix
} from '@clack/core'
import {
  type CommonOptions,
  confirm,
  intro,
  isCancel,
  log,
  symbol,
  symbolBar,
  formatInstructionFooter,
  limitOptions,
  S_CHECKBOX_ACTIVE,
  S_BAR,
  S_CHECKBOX_SELECTED,
  S_CHECKBOX_INACTIVE,
  S_BAR_END,
  select
} from '@clack/prompts'

import manifest from '../package.json' with { type: 'json' }
import { messages, type Language } from './cli-language.ts'
import { defaultSiteUrl } from './constants/site-url.ts'
import { directoryError } from './directoryError/index.ts'
import { fieldMessage } from './fieldMessage/index.ts'
import { listenEndKey } from './listenEndKey/index.ts'
import { installers } from './profile-answers.ts'
import type { Follow } from './questionFrame/index.ts'
import { questionnaireBase } from './resolve-locale-options.ts'
import { hasTool, hasRepository, missingTool, toolNames } from './tools.ts'
import type { Answers } from './types.ts'
import { CanceledError } from './usage-error.ts'
import { validateProfile } from './validateProfile/index.ts'
import { wrapFrameText } from './wrapFrameText/index.ts'

type TextLabel = {
  label: string
  placeholder: string
  output: Writable
  wrapError: (text: string) => string
}
// oxlint-disable-next-line no-control-regex
const style = /\u001B\[[\d;]*m/gu
type CursorRow = { rows: string[]; cursor: number; barWidth: number }
// WHY: The wrap of Clack keeps every character of the value in its order, so the row of the cursor comes from counting
// them, whatever the words or the width of each character.
function cursorRow({ rows, cursor, barWidth }: CursorRow): number {
  let counted = 0
  for (const [index, row] of rows.entries()) {
    counted += row.replaceAll(style, '').length - barWidth
    if (cursor < counted) return index
  }
  return rows.length - 1
}
// A row of ... above the rows of the value and one below them, and the rows split around the row of the cursor.
const moreRows = 2
const halves = 2
// The bar above the title and the empty row below the question, where Clack leaves the cursor.
const frameRows = 2
type Window = { rows: string[]; row: number; room: number; bar: string }
// The rows of the value around the row of the cursor that fit in the room, with a row of ... where rows are left out, as
// Clack does for the options of a selection. The ... rows go first when the room is short.
function valueWindow({ rows, row, room, bar }: Window): string[] {
  const more = `${bar}${styleText('dim', '...')}`
  const rest = room - 1
  if (rest >= 1 && row >= rows.length - rest) {
    return [more, ...rows.slice(rows.length - rest)]
  }
  if (rest >= 1 && row < rest) return [...rows.slice(0, rest), more]
  const between = room - moreRows
  if (between < 1) return rows.slice(row, row + 1)
  const start = Math.min(
    Math.max(1, row - Math.floor((between - 1) / halves)),
    rows.length - 1 - between
  )
  return [more, ...rows.slice(start, start + between), more]
}
type Parts = {
  output: Writable
  grayBar: string
  title: string
  value: string
  bar: string
  cursor: number
  end: string
}
// WHY: A text question is never taller than the screen, so no row of it goes to the history while it is open, where Clack
// would leave it old. On a screen too short for the bar, the title, one row of the value and the end row, the bar goes
// first, then the rows of the end row from its last, then the rows of the title from its last; the row of the cursor
// stays.
function fitScreen({
  output,
  grayBar,
  title,
  value,
  bar,
  cursor,
  end
}: Parts): string {
  const screenRows = getRows(output)
  const titleRows = wrapTextWithPrefix(output, title, '').split('\n')
  const valueRows = value.split('\n')
  const endRows = wrapTextWithPrefix(output, end, '').split('\n')
  const room = screenRows - frameRows - titleRows.length - endRows.length
  if (valueRows.length <= room) {
    return `${grayBar}\n${title}\n${value}\n${end}\n`
  }
  const barWidth = bar.replaceAll(style, '').length
  const row = cursorRow({ rows: valueRows, cursor, barWidth })
  if (room >= 1) {
    const shown = valueWindow({ rows: valueRows, row, room, bar })
    return [grayBar, ...titleRows, ...shown, ...endRows, ''].join('\n')
  }
  const left = Math.max(0, screenRows - frameRows)
  const keptTitle = titleRows.slice(0, left)
  const keptEnd = endRows.slice(0, left - keptTitle.length)
  const isBarKept = left > keptTitle.length + keptEnd.length
  return [
    ...(isBarKept ? [grayBar] : []),
    ...keptTitle,
    valueRows[row] ?? '',
    ...keptEnd,
    ''
  ].join('\n')
}
// WHY: This reproduces Clack's text renderer so a spaces-only cancellation closes with │ and a value longer than the line keeps the guide. Compare both on upgrades.
function renderText({ label, placeholder, output, wrapError }: TextLabel) {
  return function render(this: TextPrompt): string {
    const grayBar = styleText('gray', S_BAR)
    const title = `${symbol(this.state)}  ${label}`
    const heading = `${grayBar}\n${title}`
    if (this.state === 'cancel' || this.state === 'submit') {
      const isCanceled = this.state === 'cancel'
      const value = this.value ?? ''
      const formatted = isCanceled
        ? styleText(['strikethrough', 'dim'], value)
        : styleText('dim', value)
      const response = value
        ? wrapTextWithPrefix(output, formatted, `${grayBar}  `)
        : grayBar
      return [
        heading,
        response,
        ...(isCanceled && value ? [grayBar] : [])
      ].join('\n')
    }
    const color = this.state === 'error' ? 'yellow' : 'cyan'
    const hint = placeholder
      ? styleText('inverse', placeholder.slice(0, 1)) +
        styleText('dim', placeholder.slice(1))
      : styleText(['inverse', 'hidden'], '_')
    const value = this.userInput ? this.userInputWithCursor : hint
    const error =
      this.state === 'error' && this.error
        ? `  ${styleText('yellow', wrapError(this.error))}`
        : ''
    const bar = `${styleText(color, S_BAR)}  `
    return fitScreen({
      output,
      grayBar,
      title,
      value: wrapTextWithPrefix(output, value, bar),
      bar,
      cursor: this.userInput ? this.cursor : 0,
      end: `${styleText(color, S_BAR_END)}${error}`
    })
  }
}
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
  onEnd?: () => void
  follow?: Follow
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
            label: hasTool(value)
              ? toolNames[value]
              : `${toolNames[value]} · ${labels.unavailable}`
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
    const grayBar = styleText('gray', S_BAR)
    const bar = `${symbolBar(this.state) ?? grayBar}  `
    const heading = wrapTextWithPrefix(
      output,
      labels.features,
      bar,
      `${symbol(this.state)}  `
    )
    const selected = this.value ?? []
    if (this.state === 'submit' || this.state === 'cancel') {
      const isCanceled = this.state === 'cancel'
      const list = this.options
        .filter(item => selected.includes(item.value))
        .map(item =>
          isCanceled
            ? styleText(['strikethrough', 'dim'], item.label)
            : styleText('dim', item.label)
        )
        .join(styleText('dim', ', '))
      const lines = [grayBar, heading]
      if (list || !isCanceled) {
        const summary = list || styleText('dim', labels.none.toLowerCase())
        lines.push(wrapTextWithPrefix(output, summary, `${grayBar}  `))
      }
      if (isCanceled) lines.push(grayBar)
      return lines.join('\n')
    }
    const footer = formatInstructionFooter(output, [labels.featureKeys], true)
    const guideRows = 3
    const rows = limitOptions({
      output,
      options: this.options,
      cursor: this.cursor,
      columnPadding: bar.length,
      rowPadding: heading.split('\n').length + footer.length + guideRows,
      style(item, isActive) {
        const isSelected = selected.includes(item.value)
        const unchecked = isActive
          ? styleText('cyan', S_CHECKBOX_ACTIVE)
          : styleText('dim', S_CHECKBOX_INACTIVE)
        const mark = isSelected
          ? styleText('green', S_CHECKBOX_SELECTED)
          : unchecked
        const label = isActive ? item.label : styleText('dim', item.label)
        const hint =
          item.hint && (isActive || isSelected)
            ? ` ${styleText('dim', `(${item.hint})`)}`
            : ''
        return `${mark} ${label}${hint}`
      }
    })
    return [
      grayBar,
      heading,
      ...rows.map(row => bar + row),
      ...footer,
      ''
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
  intro(
    wrapFrameText({ output, text: `${name} v${manifest.version}` }).join(
      `\n${styleText('gray', S_BAR)}  `
    ),
    { output, input }
  )
  log.message(wrapFrameText({ output, text: messages[language].tagline }), {
    output,
    spacing: 0
  })
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
type Typing = { field?: TextPrompt; follow?: Follow | undefined }
const openStates = new Set(['active', 'error'])
type Questions = Omit<Session, 'onEnd' | 'follow'> & { typing: Typing }
type TextQuestion = {
  prompt: TextPrompt
  render: (this: TextPrompt) => string
  typing: Typing
  output: Writable
}
async function askText({ prompt, render, typing, output }: TextQuestion) {
  typing.field = prompt
  typing.follow?.({
    draw: () => render.call(prompt),
    rows: () => getRows(output),
    columns: () => getColumns(output),
    wrap: text => wrapTextWithPrefix(output, text, '')
  })
  try {
    return await prompt.prompt()
  } finally {
    typing.field = undefined
    typing.follow?.()
  }
}
type FieldName = Pick<FieldOptions, 'key'> &
  Pick<Session, 'language'> & {
    result: Answers
  }
function fieldName({ key, language, result }: FieldName): string {
  const labels = messages[language]
  const names = {
    name: labels.dir,
    title: labels.title,
    locales: result.mode === 'client' ? labels.appLanguage : labels.locales,
    'base-locale': result['no-i18n'] ? labels.appLanguage : labels.base,
    'site-url': labels.url
  }
  return names[key]
}
async function askQuestions({
  answers,
  language,
  input,
  output,
  hasColor,
  typing
}: Questions): Promise<Answers> {
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
    if (result[key] !== undefined) return
    let occupiedDir: string | undefined
    const render = renderText({
      label: fieldName({ key, language, result }),
      placeholder: initialValue,
      output,
      wrapError: text => directoryError({ text, dir: occupiedDir, output })
    })
    const prompt = new TextPrompt({
      ...io,
      render,
      placeholder: initialValue,
      defaultValue: initialValue,
      validate(value) {
        const problem = validateProfile({
          ...result,
          [key]: value === '' ? initialValue : (value ?? initialValue)
        }).problems.find(
          item =>
            item.field.replace(/^--/u, '') === (key === 'name' ? 'dir' : key) ||
            (key === 'locales' && item.code === 'membership')
        )
        occupiedDir = problem?.values.dir
        if (!problem) return problem
        return fieldMessage({
          language,
          code: problem.code,
          values: problem.values
        })
      }
    })
    result[key] = answer<string>(
      (await askText({ prompt, render, typing, output })) ?? initialValue
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
              ? toolNames[value]
              : `${toolNames[value]} · ${labels.unavailable}`,
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
export async function questionnaire({
  onEnd,
  follow,
  ...session
}: Session): Promise<Answers> {
  const typing: Typing = { follow }
  // WHY: At a text question Ctrl+D keeps the delete of readline while the value holds text. A question that a key before it in the same read answered counts as empty, as the next question would be in a later read.
  const stop = onEnd
    ? listenEndKey({
        input: session.input,
        shouldIgnore: () =>
          Boolean(typing.field?.userInput) &&
          openStates.has(typing.field?.state ?? ''),
        onEnd
      })
    : undefined
  try {
    return await askQuestions({ ...session, typing })
  } finally {
    stop?.()
  }
}
