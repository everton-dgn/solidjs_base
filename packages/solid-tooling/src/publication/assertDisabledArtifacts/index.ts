import { lstat } from 'node:fs/promises'
import path from 'node:path'

import { LLMS_PATH, LLMS_FULL_PATH } from '../protocol.ts'

type DisabledOptions = {
  publicDir: string
  hasLlms: boolean
  hasLlmsFull: boolean
}

export async function assertDisabledArtifacts({
  publicDir,
  hasLlms,
  hasLlmsFull
}: DisabledOptions): Promise<void> {
  const forbidden = [
    ...(hasLlms ? [] : [LLMS_PATH]),
    ...(hasLlmsFull ? [] : [LLMS_FULL_PATH])
  ]
  for (const name of forbidden) {
    try {
      await lstat(path.join(publicDir, name))
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        continue
      }
      throw error
    }
    throw new Error(`Disabled publication artifact exists: ${name}`)
  }
}
