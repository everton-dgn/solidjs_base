import nodePath from 'node:path'

import type { ArtifactDigest } from '../../types.ts'
import { digestFile } from '../artifactDigest/index.ts'
import { findMarkdownFiles } from '../findMarkdownFiles/index.ts'

type StaticOutputOptions = {
  publicDir: string
  expected: ReadonlyMap<string, string>
  approved: ReadonlyMap<string, ArtifactDigest>
}

// Compare every expected Markdown file with its approved bytes, including files outside llms-full.txt.
async function findChangedFiles({
  publicDir,
  expected,
  approved
}: StaticOutputOptions): Promise<string[]> {
  const problems: string[] = []
  for (const path of expected.keys()) {
    const digest = approved.get(path)
    if (!digest) {
      problems.push(`${path} (not validated by the prerender)`)
      continue
    }
    const actual = await digestFile(nodePath.join(publicDir, path))
    if (actual.size !== digest.size || actual.hash !== digest.hash) {
      problems.push(`${path} (content differs from the approved artifact)`)
    }
  }
  return problems
}

// The published directory is independent of Nitro records: detect public copies,
// .md.html aliases, missing files and content replaced after approval.
export async function assertStaticOutput(
  options: StaticOutputOptions
): Promise<void> {
  const { publicDir, expected } = options
  const { files, htmlAliases, irregular } = await findMarkdownFiles(publicDir)
  const found = new Set(files)
  const problems = [
    ...htmlAliases.map(path => `${path} (HTML written for a .md URL)`),
    ...irregular.map(path => `${path} (not a regular file)`),
    ...files
      .filter(path => !expected.has(path))
      .map(path => `${path} (not in the static Markdown list)`),
    ...[...expected.keys()]
      .filter(path => !found.has(path))
      .map(path => `${path} (missing from the static output)`)
  ]
  if (problems.length === 0) problems.push(...(await findChangedFiles(options)))
  if (problems.length > 0) {
    throw new Error(`Invalid static Markdown output: ${problems.join(', ')}`)
  }
}
