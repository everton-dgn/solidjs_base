import type { Report } from '../types.ts'

export function formatReport(report: Report): string {
  return [
    report.root,
    ...report.packages.map(item => `${item.package} ${item.version}`),
    ...report.skills.map(item => item.path),
    ...report.checks
      .filter(item => item.status !== 'ok')
      .map(
        item =>
          `${item.status} ${item.id} ${item.package}: ${item.observed}. ${item.fix}`
      ),
    ...report.validation.commands
  ].join('\n')
}
