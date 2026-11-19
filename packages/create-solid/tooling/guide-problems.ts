import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { parse } from 'valibot'

import { createTasks } from '../../solid-tooling/src/vite/tasks.ts'
import { guideFiles } from '../src/prepared-guides.ts'
import { manifestSchema } from '../src/schema.ts'

const fences = /^ {0,3}(?<fence>`{3,}|~{3,})/u
const heading = /^ {0,3}#{1,6} +(?<label>.+?) *#*$/u
const codeLines = /^(?: {4}|\t)/u

function linesOutsideFences(content: string): string[] {
  let marker = ''
  return content.split('\n').filter(line => {
    const fence = fences.exec(line)?.groups?.fence
    if (fence) {
      if (marker === '') {
        marker = fence
        return false
      }
      if (fence.startsWith(marker)) marker = ''
      return false
    }
    return marker === ''
  })
}

function anchors(content: string): Set<string> {
  const slugs = new Set<string>()
  for (const line of linesOutsideFences(content)) {
    const label = heading.exec(line)?.groups?.label
    if (!label) continue
    const base = label
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}\p{M} _-]/gu, '')
      .replaceAll(' ', '-')
    let slug = base
    let duplicate = 0
    while (slugs.has(slug)) {
      duplicate += 1
      slug = `${base}-${duplicate}`
    }
    slugs.add(slug)
  }
  return slugs
}

function explicitDestinations(text: string): string[] {
  const urls: string[] = []
  const definition = /^ {0,3}\[[^\]]+\]:\s*<?(?<url>[^>\s]+)/u.exec(text)
    ?.groups?.url
  if (definition) urls.push(definition)
  for (const attribute of text.matchAll(
    /\b(?:href|src)=["'](?<url>[^"']+)["']/gu
  )) {
    const url = attribute.groups?.url
    if (url) urls.push(url)
  }
  for (const attribute of text.matchAll(/\bsrcset=["'](?<list>[^"']+)["']/gu)) {
    for (const item of attribute.groups?.list?.split(',') ?? []) {
      const [url] = item.trim().split(/\s+/u)
      if (url) urls.push(url)
    }
  }
  return urls
}

function destinations(line: string): string[] {
  const text = line.replaceAll(/`[^`]*`/gu, '')
  const urls = explicitDestinations(text)
  for (const match of text.matchAll(/\]\(<?/gu)) {
    let depth = 0
    let url = ''
    for (const char of text.slice(match.index + match[0].length)) {
      if (char === '>' || /\s/u.test(char) || (char === ')' && depth === 0)) {
        break
      }
      if (char === '(') depth += 1
      if (char === ')') depth -= 1
      url += char
    }
    if (url) urls.push(url)
  }
  return urls
}

export function guideProblems(dir: string): string[] {
  const problems = new Set<string>()
  const headings = new Map<string, Set<string>>()
  const manifest = readFileSync(path.join(dir, 'package.json'), 'utf8')
  const pkg = parse(manifestSchema, JSON.parse(manifest))
  const tasks = createTasks({ root: dir, isCi: true, hasI18n: true })
  for (const file of ['AGENTS.md', ...guideFiles(dir)]) {
    const source = path.join(dir, file)
    const content = readFileSync(source, 'utf8')
    for (const match of content.matchAll(/\bvp run (?<task>[a-z][\w:-]*)/gu)) {
      const task = match.groups?.task
      if (
        task &&
        !Object.hasOwn(pkg.scripts, task) &&
        !Object.hasOwn(tasks, task)
      ) {
        problems.add(`${file}: task ${task}`)
      }
    }
    for (const line of linesOutsideFences(content)) {
      if (codeLines.test(line)) continue
      for (const url of destinations(line)) {
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(url)) continue
        const [relative, fragment] = url.split('#')
        const target = relative
          ? path.resolve(path.dirname(source), decodeURIComponent(relative))
          : source
        if (!existsSync(target)) {
          problems.add(`${file}: missing ${url}`)
          continue
        }
        if (
          !fragment ||
          !target.endsWith('.md') ||
          !statSync(target).isFile()
        ) {
          continue
        }
        const known =
          headings.get(target) ?? anchors(readFileSync(target, 'utf8'))
        headings.set(target, known)
        if (!known.has(decodeURIComponent(fragment))) {
          problems.add(`${file}: missing ${url}`)
        }
      }
    }
  }
  return [...problems]
}
