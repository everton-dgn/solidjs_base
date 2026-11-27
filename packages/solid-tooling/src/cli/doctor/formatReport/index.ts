import path from 'node:path'
import { styleText } from 'node:util'

import type { Check, Report } from '../types.ts'

type StyleFormat = Parameters<typeof styleText>[0]
type Paint = (format: StyleFormat, text: string) => string
type ReportView = { report: Report; realRoot: string; isStyled: boolean }
type Section = {
  report: Report
  paint: Paint
  isStyled: boolean
  roots: string[]
}
type Row = [label: string, value: string]
type PathView = { file: string; roots: string[] }
type Count = { count: number; noun: string }
type Problem = Omit<Section, 'report'> & { check: Check }

const INDENT = '  '
const DETAIL = '      '
const STATUS = {
  error: { symbol: '✖', format: 'red' },
  warning: { symbol: '⚠', format: 'yellow' }
} as const

function plain(_format: StyleFormat, text: string): string {
  return text
}
function styled(format: StyleFormat, text: string): string {
  return styleText(format, text, { validateStream: false })
}
function plural({ count, noun }: Count): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
function byName(first: string, second: string): number {
  if (first === second) return 0
  return first < second ? -1 : 1
}
// The skill paths come from realpath and the check files from the root as
// given, so a path is shown relative when it is inside either form.
function displayPath({ file, roots }: PathView): string {
  for (const root of roots) {
    const relative = path.relative(root, file)
    if (
      relative &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    ) {
      return relative
    }
  }
  return file
}
function columns(rows: Row[]): string[] {
  const width = Math.max(...rows.map(([label]) => label.length))
  return rows.map(
    ([label, value]) => `${INDENT}${label.padEnd(width)}  ${value}`
  )
}
function applicationSection({ report, paint }: Section): string[] {
  const rows: Row[] = [['folder', report.root]]
  if (report.workspaceRoot !== report.root) {
    rows.push(['installation root', report.workspaceRoot])
  }
  return [paint('bold', 'Application'), ...columns(rows)]
}
function packagesSection({ report, paint }: Section): string[] {
  const rows = report.packages
    .toSorted((first, second) => byName(first.package, second.package))
    .map((item): Row => [item.package, item.version])
  return [
    paint('bold', 'Installed packages'),
    ...(rows.length > 0 ? columns(rows) : [`${INDENT}none found`])
  ]
}
function problemLines({ check, paint, isStyled, roots }: Problem): string[] {
  const status = check.status === 'error' ? STATUS.error : STATUS.warning
  const label = paint(
    status.format,
    isStyled ? `${status.symbol} ${check.status}` : check.status
  )
  const subject = check.package ? ` ${check.package}` : ''
  return [
    `${INDENT}${label} ${paint('bold', check.id)}${subject}`,
    `${DETAIL}expected ${check.expected}, observed ${check.observed}`,
    `${DETAIL}${paint('dim', 'source:')} ${displayPath({ file: check.source, roots })}`,
    `${DETAIL}${paint('dim', 'fix:')} ${check.fix}`,
    `${DETAIL}${paint('dim', 'edit:')} ${displayPath({ file: check.file, roots })}`
  ]
}
function checksSection({ report, paint, isStyled, roots }: Section): string[] {
  const errors = report.checks.filter(check => check.status === 'error')
  const warnings = report.checks.filter(check => check.status === 'warning')
  const passed = report.checks.length - errors.length - warnings.length
  const counts = [
    paint('green', `${isStyled ? '✔ ' : ''}${passed} passed`),
    paint(
      warnings.length > 0 ? STATUS.warning.format : 'dim',
      `${isStyled ? `${STATUS.warning.symbol} ` : ''}${plural({ count: warnings.length, noun: 'warning' })}`
    ),
    paint(
      errors.length > 0 ? STATUS.error.format : 'dim',
      `${isStyled ? `${STATUS.error.symbol} ` : ''}${plural({ count: errors.length, noun: 'error' })}`
    )
  ]
  return [
    `${paint('bold', 'Checks:')} ${counts.join(', ')}`,
    ...[...errors, ...warnings].flatMap(check =>
      problemLines({ check, paint, isStyled, roots })
    )
  ]
}
function skillsSection({ report, paint, roots }: Section): string[] {
  const groups = Map.groupBy(report.skills, skill => skill.package)
  const lines: string[] = []
  for (const name of [...groups.keys()].toSorted(byName)) {
    lines.push(`${INDENT}${name}`)
    for (const skill of groups.get(name) ?? []) {
      lines.push(
        `${INDENT}${INDENT}${displayPath({ file: skill.path, roots })}`
      )
    }
  }
  return [
    paint('bold', 'Skills to read'),
    ...(lines.length > 0 ? lines : [`${INDENT}none found`])
  ]
}
function commandsSection({ report, paint }: Section): string[] {
  const { cwd, commands } = report.validation
  const place = cwd === report.root ? [] : [`${INDENT}run them in ${cwd}`]
  return [
    paint('bold', 'Commands that validate a change'),
    ...place,
    ...(commands.length > 0
      ? commands.map(command => `${INDENT}${command}`)
      : [`${INDENT}none found`])
  ]
}

export function formatReport({
  report,
  realRoot,
  isStyled
}: ReportView): string {
  const section = {
    report,
    paint: isStyled ? styled : plain,
    isStyled,
    roots: [report.root, realRoot]
  }
  return [
    applicationSection(section),
    packagesSection(section),
    checksSection(section),
    skillsSection(section),
    commandsSection(section)
  ]
    .map(lines => lines.join('\n'))
    .join('\n\n')
}
