import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

import { parseJson, readFields } from '../mergePullRequest/json.ts'

type WorkspaceQuery = { root: string; workspace: string }

type Containment = { root: string; target: string }

const MANIFEST = 'package.json'

function isInside({ root, target }: Containment): boolean {
  const relative = path.relative(root, target)
  const [first] = relative.split(path.sep)
  return first !== '..' && !path.isAbsolute(relative)
}

async function resolveManifest(file: string): Promise<string | undefined> {
  try {
    return await realpath(file)
  } catch {
    return undefined
  }
}

// The lock names the root workspace with an empty folder.
export function describeWorkspace(workspace: string): string {
  return workspace === '' ? 'the root' : workspace
}

export async function readWorkspaceVersion({
  root,
  workspace
}: WorkspaceQuery): Promise<string> {
  const name = describeWorkspace(workspace)
  const folder = path.resolve(root, workspace)
  if (!isInside({ root, target: folder })) {
    throw new Error(`the folder of the workspace ${name} is outside the root`)
  }
  const manifest = await resolveManifest(path.join(folder, MANIFEST))
  if (manifest === undefined) {
    throw new Error(`the workspace ${name} has no ${MANIFEST}`)
  }
  // WHY: a link inside the root can point to a package.json of another
  // folder, whose version says nothing about this workspace.
  if (!isInside({ root: await realpath(root), target: manifest })) {
    throw new Error(
      `the ${MANIFEST} of the workspace ${name} leads through a link to a file outside the root`
    )
  }
  const text = await readFile(manifest, 'utf8')
  const label = path.join(workspace, MANIFEST)
  return readFields({ value: parseJson({ text, label }), label }).string(
    'version'
  )
}
