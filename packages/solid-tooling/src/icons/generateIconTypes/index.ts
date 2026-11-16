import { writeIconTypes } from '@evertondgn/vite-plugin-solid-icons'
import * as v from 'valibot'

const taskOptionsSchema = v.object({
  root: v.string(),
  collections: v.record(v.string(), v.string())
})

export type IconTypesTask = v.InferOutput<typeof taskOptionsSchema>

// WHY: the plugin only warns about a collection that it cannot read, so the
// dev server keeps running. The task stops instead, so a type check never runs
// on declarations that leave a collection out.
export async function generateIconTypes(
  argument: string | undefined
): Promise<string> {
  if (argument === undefined) {
    throw new Error(
      'icons-generate takes the root and the icon collections of defineSolidApp as JSON.'
    )
  }
  const options = v.parse(taskOptionsSchema, JSON.parse(argument))
  const { file, warnings } = await writeIconTypes(options)
  if (warnings.length > 0) throw new Error(warnings.join('\n'))
  return file
}
