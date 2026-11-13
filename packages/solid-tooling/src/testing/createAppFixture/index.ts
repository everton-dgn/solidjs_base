import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'

type AppFixture = {
  context: TestContext
  files: Record<string, string>
}

export async function createAppFixture({
  context,
  files
}: AppFixture): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'solid-tooling-app-'))
  // Sandbox created by this test: removing it directly is the right cleanup.
  context.after(() => rm(root, { recursive: true, force: true }))
  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      const target = path.join(root, file)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, content)
    })
  )
  return root
}
