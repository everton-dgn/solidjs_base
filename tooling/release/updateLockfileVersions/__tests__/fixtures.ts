import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'

type LockVersions = { runtime: string; tooling: string }

type LineEdit = { text: string; from: string; to: string }

type LineSearch = { text: string; line: string }

type Manifest = { folder: string; version: string }

type Workspace = {
  context: TestContext
  lock: string
  manifests: Record<string, string>
}

type CreatedWorkspace = { folder: string; root: string; lockfile: string }

// The workspace versions that Bun wrote before the release, and the ones the
// release pull request writes in each package.json.
export const LOCKED: LockVersions = { runtime: '0.1.0', tooling: '0.6.0' }

export const RELEASED: LockVersions = { runtime: '0.7.0', tooling: '0.7.0' }

export const MANIFESTS = {
  '': '0.0.0',
  'packages/runtime': RELEASED.runtime,
  'packages/tooling': RELEASED.tooling
}

// The shape Bun writes, trailing commas included. The tooling depends on a
// package named "version", and a named catalog lists it outside the workspaces.
export function renderLock({ runtime, tooling }: LockVersions): string {
  return `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "root",
      "devDependencies": {
        "@x/tooling": "workspace:*",
      },
    },
    "packages/runtime": {
      "name": "@x/runtime",
      "version": "${runtime}",
      "dependencies": {
        "valibot": "1.5.0",
      },
    },
    "packages/tooling": {
      "name": "@x/tooling",
      "version": "${tooling}",
      "dependencies": {
        "@x/runtime": "workspace:*",
        "version": "0.6.0",
      },
    },
  },
  "catalogs": {
    "tools": {
      "version": "0.6.0",
    },
  },
  "packages": {
    "@x/runtime": ["@x/runtime@workspace:packages/runtime"],

    "@x/tooling": ["@x/tooling@workspace:packages/tooling"],

    "valibot": ["valibot@1.5.0", "", {}, "sha512-AAAA=="],

    "version": ["version@0.6.0", "", {}, "sha512-BBBB=="],
  }
}
`
}

// Fails unless the line is there once, so a test never edits a line it did not
// mean to.
export function editLine({ text, from, to }: LineEdit): string {
  const lines = text.split('\n')
  const matches = lines.filter(line => line === from).length
  if (matches !== 1) {
    throw new Error(`The lock has ${matches} lines ${JSON.stringify(from)}.`)
  }
  return lines.map(line => (line === from ? to : line)).join('\n')
}

export function lineNumber({ text, line }: LineSearch): number {
  return text.split('\n').indexOf(line) + 1
}

export async function makeFolder(context: TestContext): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'update-lockfile-'))
  context.after(() => rm(folder, { recursive: true, force: true }))
  return folder
}

export async function writeManifest({
  folder,
  version
}: Manifest): Promise<void> {
  await mkdir(folder, { recursive: true })
  await writeFile(
    path.join(folder, 'package.json'),
    JSON.stringify({ name: path.basename(folder), version })
  )
}

export async function makeWorkspace({
  context,
  lock,
  manifests
}: Workspace): Promise<CreatedWorkspace> {
  const folder = await makeFolder(context)
  const root = path.join(folder, 'root')
  await mkdir(root)
  await Promise.all(
    Object.entries(manifests).map(([workspace, version]) =>
      writeManifest({ folder: path.join(root, workspace), version })
    )
  )
  const lockfile = path.join(root, 'bun.lock')
  await writeFile(lockfile, lock)
  return { folder, root, lockfile }
}
