import { createPlugin, type ElementNode, htmlToMarkdown } from '@mdream/js'
import { filterPlugin, isolateMainPlugin } from '@mdream/js/plugins'

import { EXCLUDED_ELEMENTS, MAX_HTML_BYTES } from '../../constants.ts'

type ConvertOptions = {
  response: Response
  url: string
  signal: AbortSignal
  maxBytes?: number
}

// With whitespace or control characters before the scheme, mdream resolves the URL against the public origin.
const UNSAFE_URL = /^(?:javascript|vbscript|data):/iu
// A bare fragment is the neutral destination for unsafe schemes.
const FRAGMENT_URL = /^#./u

// In these regions mdream emits HTML links and already removes unsafe schemes.
const RAW_HTML_REGIONS = new Set([
  'address',
  'dd',
  'details',
  'dl',
  'dt',
  'summary'
])

// Removing an image is safe in these containers. The optional mdream patch also
// moves emphasis whitespace outside its delimiters. Other ancestors can leave
// empty links or move raw HTML to the beginning of a line.
const PLAIN_CONTAINERS = new Set([
  'article',
  'aside',
  'b',
  'blockquote',
  'body',
  'del',
  'div',
  'em',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'html',
  'i',
  'li',
  'main',
  'ol',
  'p',
  'picture',
  's',
  'section',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul'
])

function isInsideRawHtml({ parent }: ElementNode): boolean {
  if (!parent) return false
  return RAW_HTML_REGIONS.has(parent.name) || isInsideRawHtml(parent)
}

function isInsidePlainContainers({ parent }: ElementNode): boolean {
  if (!parent) return true
  return PLAIN_CONTAINERS.has(parent.name) && isInsidePlainContainers(parent)
}

// Mdream shares a frozen object for elements without attributes. Fragment-only
// links must resolve against the source page, or llms-full.txt would target itself.
const createCleanupPlugin = (url: string) =>
  createPlugin({
    processAttributes(node) {
      const { name, attributes } = node
      // Reducing the link to text could emit its nested heading as raw HTML at the
      // start of a line, turning escaped text back into a tag.
      if (
        name === 'a' &&
        UNSAFE_URL.test(attributes.href ?? '') &&
        !isInsideRawHtml(node)
      ) {
        node.attributes = { ...attributes, href: '#' }
      }
      const href = node.attributes.href ?? ''
      if (name === 'a' && FRAGMENT_URL.test(href)) {
        node.attributes = { ...node.attributes, href: new URL(href, url).href }
      }
      if (
        name === 'img' &&
        !attributes.alt?.trim() &&
        !attributes.title?.trim() &&
        isInsidePlainContainers(node)
      ) {
        node.attributes = { ...attributes, 'data-md-exclude': '' }
      }
    }
  })

export async function convertHtml({
  response,
  url,
  signal,
  maxBytes = MAX_HTML_BYTES
}: ConvertOptions): Promise<string> {
  signal.throwIfAborted()
  // Async SSR may already hold the full HTML; this bounds the additional accumulation.
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Markdown response has no body')
  const chunks: Uint8Array[] = []
  let bytes = 0
  let cancellation: Promise<void> | undefined
  const cancel = () => {
    cancellation ??= (async () => {
      try {
        await reader.cancel()
      } catch {
        // Failed cancellation still ends ownership of this reader.
      }
    })()
    return cancellation
  }
  const onAbort = () => {
    void cancel()
  }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maxBytes) {
        throw new Error('Markdown document limit exceeded')
      }
      chunks.push(chunk.value)
    }
  } catch (error) {
    await cancel()
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (cancellation) await cancellation
  }
  signal.throwIfAborted()
  const html = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    html.set(chunk, offset)
    offset += chunk.byteLength
  }
  return htmlToMarkdown(new TextDecoder().decode(html), {
    origin: url,
    plugins: [
      isolateMainPlugin(),
      filterPlugin({ exclude: EXCLUDED_ELEMENTS }),
      createCleanupPlugin(url)
    ]
  })
}
