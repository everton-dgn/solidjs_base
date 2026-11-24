import type { Readable } from 'node:stream'

type Key = { ctrl?: boolean; name?: string }
type EndKey = { input: Readable; hasText: () => boolean; onEnd: () => void }
// WHY: readline ends its input on Ctrl+D only while its own line is empty. A select, a multiselect or a confirm keeps a line nobody sees, which keys such as j, k, space or a letter fill, and a key read in the same chunk as the Ctrl+D would still reach the question. Registered before a prompt starts, this runs before the listeners of the prompt on every key.
export function listenEndKey({ input, hasText, onEnd }: EndKey): () => void {
  const onKeypress = (_text: string | undefined, key?: Key) => {
    if (key?.ctrl && key.name === 'd' && !hasText()) onEnd()
  }
  input.on('keypress', onKeypress)
  return () => input.off('keypress', onKeypress)
}
