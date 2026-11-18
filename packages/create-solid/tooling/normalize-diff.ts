export function normalizeDiff(
  diff: string,
  settings: { version: string; versions: Record<string, string> }
): string {
  const { version } = settings
  return diff
    .split('\n')
    .filter(line => !line.startsWith('index '))
    .map(line => {
      if (!line.startsWith('+')) return line
      let normalized = line.replaceAll(
        `/create-solid@${version}/`,
        '/create-solid@{version}/'
      )
      for (const [name, pinned] of Object.entries(settings.versions)) {
        normalized = normalized.replace(
          `"${name}": "${pinned}"`,
          `"${name}": "{version}"`
        )
      }
      return normalized
    })
    .join('\n')
}
