import path from 'node:path'
import process from 'node:process'

export function shellDirectory(dir: string): string {
  let relative = path.relative(process.cwd(), dir) || '.'
  if (relative.startsWith('-')) relative = `./${relative}`
  return /^[a-zA-Z0-9_./-]+$/u.test(relative)
    ? relative
    : `'${relative.replaceAll("'", String.raw`'\''`)}'`
}
