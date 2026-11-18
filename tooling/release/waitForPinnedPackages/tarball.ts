import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'

import { parseJson } from '../mergePullRequest/json.ts'

type Range = { start: number; end: number }

type FieldRead = { block: Buffer; range: Range }

type Archive = { archive: Buffer; label: string }

type Header = { block: Buffer; label: string }

type Entry = { name: string; type: string; content: Buffer }

type MetaEntry = { type: string; content: Buffer }

const BLOCK_SIZE = 512
// Fields of a POSIX ustar header.
const NAME: Range = { start: 0, end: 100 }
const SIZE: Range = { start: 124, end: 136 }
const TYPE: Range = { start: 156, end: 157 }
const MAGIC: Range = { start: 257, end: 263 }
const PREFIX: Range = { start: 345, end: 500 }
const OCTAL = 8
const SPACE = 0x20
const NUL = 0
// A regular file is "0", or a NUL for old archivers. A pax header and a GNU
// long name describe the entry that follows them.
const FILE_TYPES = new Set(['0', ''])
const PAX_HEADER = 'x'
const LONG_NAME = 'L'
const USTAR = 'ustar'
const MANIFEST = 'package/package.json'

const decompress = promisify(gunzip)

function readText({ block, range }: FieldRead): string {
  const field = block.subarray(range.start, range.end)
  const end = field.indexOf(NUL)
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8')
}

function readSize({ block, label }: Header): number {
  const text = readText({ block, range: SIZE }).trim()
  if (!/^[0-7]+$/u.test(text)) {
    throw new Error(`${label} has a tar header with an unreadable size.`)
  }
  return Number.parseInt(text, OCTAL)
}

// GNU tar writes "ustar " and keeps other fields where ustar has the prefix.
function readName(block: Buffer): string {
  const name = readText({ block, range: NAME })
  const isUstar = readText({ block, range: MAGIC }) === USTAR
  const prefix = isUstar ? readText({ block, range: PREFIX }) : ''
  return prefix ? `${prefix}/${name}` : name
}

// Each pax record is "<length> <key>=<value>\n", the length counting the
// whole record in bytes.
function readPaxPath(content: Buffer): string | undefined {
  let offset = 0
  let path: string | undefined
  while (offset < content.length) {
    const space = content.indexOf(SPACE, offset)
    if (space === -1) return path
    const length = Number(content.subarray(offset, space).toString('utf8'))
    if (!Number.isInteger(length) || length <= space - offset) return path
    const record = content
      .subarray(space + 1, offset + length - 1)
      .toString('utf8')
    const separator = record.indexOf('=')
    if (record.slice(0, separator) === 'path') {
      path = record.slice(separator + 1)
    }
    offset += length
  }
  return path
}

function readNextName({ type, content }: MetaEntry): string | undefined {
  if (type === PAX_HEADER) return readPaxPath(content)
  return readText({ block: content, range: { start: 0, end: content.length } })
}

function* readEntries({ archive, label }: Archive): Generator<Entry> {
  let offset = 0
  let nextName: string | undefined
  while (offset + BLOCK_SIZE <= archive.length) {
    const block = archive.subarray(offset, offset + BLOCK_SIZE)
    if (block.every(byte => byte === NUL)) return
    const size = readSize({ block, label })
    const start = offset + BLOCK_SIZE
    if (start + size > archive.length) {
      throw new Error(`${label} ends in the middle of a file.`)
    }
    const content = archive.subarray(start, start + size)
    offset = start + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
    const type = readText({ block, range: TYPE })
    if (type === PAX_HEADER || type === LONG_NAME) {
      nextName = readNextName({ type, content }) ?? nextName
    } else {
      yield { name: nextName ?? readName(block), type, content }
      nextName = undefined
    }
  }
}

export async function readPackedManifest(
  tarball: string,
  file = MANIFEST,
  optional = false
): Promise<unknown> {
  const compressed = await readFile(tarball)
  let archive: Buffer
  try {
    archive = await decompress(compressed)
  } catch (error) {
    throw new Error(`${tarball} is not a gzip file.`, { cause: error })
  }
  for (const entry of readEntries({ archive, label: tarball })) {
    const name = entry.name.replace(/^\.\//u, '')
    if (FILE_TYPES.has(entry.type) && name === file) {
      return parseJson({
        text: entry.content.toString('utf8'),
        label: `${file} in ${tarball}`
      })
    }
  }
  if (optional) return undefined
  throw new Error(`${tarball} has no ${file}.`)
}
