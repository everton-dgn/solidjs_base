import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

import type {
  Command,
  CommandResult,
  Environment
} from '../../mergePullRequest/types.ts'

type TarEntry = { name: string; content?: string; type?: string }

type TarHeader = { name: string; size: number; type: string }

type Tarball = { folder: string; entries: readonly TarEntry[] }

type PackedManifest = { folder: string; manifest: unknown }

type Workspace = {
  folder: string
  workspaces: unknown
  packages: Record<string, string>
}

type FakeEnvironment = {
  environment: Environment
  calls: Command[]
  lines: string[]
  sleeps: number[]
}

const BLOCK_SIZE = 512
// Offsets of the fields of a ustar header.
const HEADER = {
  name: 0,
  mode: 100,
  uid: 108,
  gid: 116,
  size: 124,
  mtime: 136,
  checksum: 148,
  type: 156,
  magic: 257,
  version: 263
}
const NAME_LENGTH = 100
const OCTAL = 8
const SIZE_DIGITS = 11
const CHECKSUM_DIGITS = 6
const CHECKSUM_LENGTH = 8
// Two empty blocks end a tar archive.
const END_BLOCKS = 2

const compress = promisify(gzip)

function writeHeader({ name, size, type }: TarHeader): Buffer {
  const block = Buffer.alloc(BLOCK_SIZE)
  block.write(name, HEADER.name, NAME_LENGTH, 'utf8')
  block.write('0000644\0', HEADER.mode)
  block.write('0000000\0', HEADER.uid)
  block.write('0000000\0', HEADER.gid)
  block.write(
    `${size.toString(OCTAL).padStart(SIZE_DIGITS, '0')}\0`,
    HEADER.size
  )
  block.write('00000000000\0', HEADER.mtime)
  block.write(' '.repeat(CHECKSUM_LENGTH), HEADER.checksum)
  block.write(type, HEADER.type)
  block.write('ustar\0', HEADER.magic)
  block.write('00', HEADER.version)
  const checksum = block.reduce((total, byte) => total + byte, 0)
  block.write(
    `${checksum.toString(OCTAL).padStart(CHECKSUM_DIGITS, '0')}\0 `,
    HEADER.checksum
  )
  return block
}

function padToBlock(content: Buffer): Buffer {
  const padding = (BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE
  return Buffer.concat([content, Buffer.alloc(padding)])
}

// Each spec takes the next answer of its list and repeats the last one.
export type FakeRegistry = Record<string, readonly CommandResult[]>

// The length at the start of a pax record counts its own digits, which can
// add one digit to the length.
export function paxRecord(value: string): string {
  const body = ` path=${value}\n`
  const shortest = String(body.length).length
  const digits = String(body.length + shortest).length
  return `${body.length + digits}${body}`
}

export async function makeFolder(context: TestContext): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'wait-for-pinned-'))
  context.after(() => rm(folder, { recursive: true, force: true }))
  return folder
}

export async function writeTarball({
  folder,
  entries
}: Tarball): Promise<string> {
  const blocks = entries.flatMap(({ name, content = '', type = '0' }) => {
    const data = Buffer.from(content, 'utf8')
    return [writeHeader({ name, size: data.length, type }), padToBlock(data)]
  })
  const archive = Buffer.concat([
    ...blocks,
    Buffer.alloc(BLOCK_SIZE * END_BLOCKS)
  ])
  const file = path.join(folder, 'package.tgz')
  await writeFile(file, await compress(archive))
  return file
}

export async function packManifest({
  folder,
  manifest
}: PackedManifest): Promise<string> {
  return writeTarball({
    folder,
    entries: [
      { name: 'package/', type: '5' },
      { name: 'package/package.json', content: JSON.stringify(manifest) }
    ]
  })
}

export async function makeWorkspace({
  folder,
  workspaces,
  packages
}: Workspace): Promise<string> {
  const root = path.join(folder, 'root')
  await mkdir(root)
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'root', private: true, workspaces })
  )
  await Promise.all(
    Object.entries(packages).map(async ([packageFolder, name]) => {
      await mkdir(path.join(root, packageFolder), { recursive: true })
      await writeFile(
        path.join(root, packageFolder, 'package.json'),
        JSON.stringify({ name, version: '0.8.0' })
      )
    })
  )
  return root
}

export function found(version: string): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify([version]), stderr: '' }
}

export function failed(stderr: string): CommandResult {
  return { exitCode: 1, stdout: '', stderr }
}

export const NOT_FOUND = failed(
  'npm error code E404\nnpm error 404 No match found for version 0.8.0'
)

export function fakeEnvironment(registry: FakeRegistry): FakeEnvironment {
  const calls: Command[] = []
  const lines: string[] = []
  const sleeps: number[] = []
  const answered = new Map<string, number>()
  let time = 0
  const environment: Environment = {
    run: command => {
      calls.push(command)
      const spec = command.args[1] ?? ''
      const answers = registry[spec] ?? [NOT_FOUND]
      const count = answered.get(spec) ?? 0
      answered.set(spec, count + 1)
      const answer = answers[Math.min(count, answers.length - 1)] ?? NOT_FOUND
      return Promise.resolve(answer)
    },
    log: line => {
      lines.push(line)
    },
    sleep: milliseconds => {
      sleeps.push(milliseconds)
      time += milliseconds
      return Promise.resolve()
    },
    now: () => time
  }
  return { environment, calls, lines, sleeps }
}
