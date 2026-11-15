type Attribute = {
  name: string
  // The value as the file writes it, between its quotes.
  rawValue: string
  quote: string
  // The value with its character references read.
  value: string
}

type TextNode = { kind: 'text'; raw: string; value: string; isCdata: boolean }

type ElementNode = {
  kind: 'element'
  name: string
  attributes: Attribute[]
  children: SvgNode[]
}

type SvgNode = TextNode | ElementNode

type StartTag = {
  name: string
  attributes: Attribute[]
  isSelfClosing: boolean
  end: number
}

type Scanner = { svg: string; at: number }
type PatternRead = { scanner: Scanner; pattern: RegExp }
type ElementRead = { scanner: Scanner; element: string }
type MarkupSkip = { scanner: Scanner; open: string; close: string }
type TextInput = { parent: ElementNode; raw: string }
type ContentInput = {
  scanner: Scanner
  root: ElementNode
  isComponent: boolean
}
type AttributeCheck = { attribute: Attribute; element: string }
type DuplicateCheck = { attributes: Attribute[]; element: string }
type CheckInput = { node: ElementNode; isComponent: boolean }
type TagInput = { node: ElementNode; isRoot: boolean }
type ParseInput = { svg: string; isComponent: boolean }
type RawTextInput = { svg: string; parsed: ParsedSvg }
type NodeInput = {
  scanner: Scanner
  parent: ElementNode
  open: ElementNode[]
  isComponent: boolean
}
type JsxInput = {
  node: SvgNode | string
  root: ElementNode
  pending: (SvgNode | string)[]
}

const NAME = /[A-Za-z_][\w.:-]*/uy
const SPACE = /[\t\n\r ]*/uy
const QUOTES = new Set(['"', "'"])
const REFERENCES = /&(?:#x[\da-f]+|#\d+|[a-z][\w.-]*);/giu
const REFERENCE =
  /^&(?:#x(?<hex>[\da-f]+)|#(?<decimal>\d+)|(?<named>[a-z][\w.-]*));$/iu
const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
}
const MAX_CODE_POINT = 1_114_111
const FIRST_SURROGATE = 55_296
const LAST_SURROGATE = 57_343
// WHY: a browser drops the ASCII whitespace and control characters of a URL
// before it reads the scheme, so "java\tscript:" is still a script URL.
// oxlint-disable-next-line eslint/no-control-regex -- the control characters are the ones a browser drops.
const URL_IGNORED = /[\u0000- ]/gu
const SCRIPT_URL = /^(?:javascript|vbscript):/u
// JSX reads a capital first letter, a dot or a colon in a tag as code.
const JSX_TAG = /^[a-z][\dA-Za-z]*(?:-[\dA-Za-z]+)*$/u
const JSX_ATTRIBUTE = /^[A-Za-z_][\w-]*(?::[A-Za-z_][\w-]*)?$/u
// The namespaces and props that the Solid compiler reads as code or as DOM
// properties, not as attributes.
const SOLID_NAMESPACES = new Set([
  'attr',
  'bool',
  'class',
  'on',
  'oncapture',
  'prop',
  'style',
  'use'
])
const SOLID_PROPS = new Set([
  'children',
  'innerHTML',
  'innerText',
  'ref',
  'textContent'
])
const PLAIN_TEXT = /^[^&<>{}]*$/u
const CDATA_START = '<![CDATA['
const CDATA_END = ']]>'
const CLOSING_TAG_START = '</'
const EMPTY_TAG_END = '/>'
// Comments and processing instructions, which the component leaves out.
const SKIPPED_MARKUP = [
  ['<!--', '-->'],
  ['<?', '?>']
] as const

class SvgError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'SvgError'
  }
}

function malformed(detail: string): SvgError {
  return new SvgError(`the SVG is not well-formed: ${detail}`)
}

function read({ scanner, pattern }: PatternRead): string {
  pattern.lastIndex = scanner.at
  const match = pattern.exec(scanner.svg)
  if (!match) return ''
  scanner.at = pattern.lastIndex
  return match[0]
}

function skipSpace(scanner: Scanner): void {
  read({ scanner, pattern: SPACE })
}

function character(reference: string): string {
  const { hex, decimal, named } = REFERENCE.exec(reference)?.groups ?? {}
  if (named !== undefined) {
    const entity = XML_ENTITIES[named]
    if (entity === undefined) {
      throw malformed(
        `&${named}; is not an XML entity: write the character or a numeric reference such as &#160;`
      )
    }
    return entity
  }
  const value = hex === undefined ? Number(decimal) : Number.parseInt(hex, 16)
  const isSurrogate = value >= FIRST_SURROGATE && value <= LAST_SURROGATE
  const isOutside = value === 0 || value > MAX_CODE_POINT || isSurrogate
  if (!Number.isInteger(value) || isOutside) {
    throw malformed(`${reference} is not a character`)
  }
  return String.fromCodePoint(value)
}

function decode(text: string): string {
  if (!text.includes('&')) return text
  if (text.replaceAll(REFERENCES, '').includes('&')) {
    throw malformed('a "&" starts no reference: write &amp;')
  }
  return text.replaceAll(REFERENCES, reference => character(reference))
}

function readAttribute({ scanner, element }: ElementRead): Attribute {
  const name = read({ scanner, pattern: NAME })
  if (name === '') {
    throw malformed(`<${element}> has an attribute without a name`)
  }
  skipSpace(scanner)
  const hasEquals = scanner.svg.charAt(scanner.at) === '='
  if (hasEquals) scanner.at += 1
  skipSpace(scanner)
  const quote = scanner.svg.charAt(scanner.at)
  if (!hasEquals || !QUOTES.has(quote)) {
    throw malformed(`the attribute ${name} of <${element}> has no quoted value`)
  }
  const start = scanner.at + 1
  const end = scanner.svg.indexOf(quote, start)
  if (end === -1) {
    throw malformed(
      `the value of the attribute ${name} of <${element}> is not closed`
    )
  }
  const rawValue = scanner.svg.slice(start, end)
  if (rawValue.includes('<')) {
    throw malformed(
      `the value of the attribute ${name} of <${element}> has a "<"`
    )
  }
  scanner.at = end + 1
  return { name, rawValue, quote, value: decode(rawValue) }
}

function readStartTag(scanner: Scanner): StartTag {
  scanner.at += 1
  const name = read({ scanner, pattern: NAME })
  if (name === '') throw malformed('a "<" starts no tag: write &lt;')
  const attributes: Attribute[] = []
  for (;;) {
    const before = scanner.at
    skipSpace(scanner)
    if (scanner.svg.startsWith(EMPTY_TAG_END, scanner.at)) {
      const end = scanner.at + EMPTY_TAG_END.length
      return { name, attributes, isSelfClosing: true, end }
    }
    if (scanner.svg.startsWith('>', scanner.at)) {
      return { name, attributes, isSelfClosing: false, end: scanner.at + 1 }
    }
    if (scanner.at >= scanner.svg.length) {
      throw malformed(`<${name}> is not closed`)
    }
    if (scanner.at === before) {
      throw malformed(`the attributes of <${name}> are not separated by spaces`)
    }
    attributes.push(readAttribute({ scanner, element: name }))
  }
}

function readClosingTag({ scanner, element }: ElementRead): void {
  scanner.at += CLOSING_TAG_START.length
  const name = read({ scanner, pattern: NAME })
  skipSpace(scanner)
  if (scanner.svg.charAt(scanner.at) !== '>') {
    throw malformed(`the closing tag of <${element}> is not closed`)
  }
  scanner.at += 1
  if (name !== element) throw malformed(`</${name}> closes <${element}>`)
}

function skipMarkup({ scanner, open, close }: MarkupSkip): string {
  const end = scanner.svg.indexOf(close, scanner.at)
  if (end === -1) throw malformed(`a ${open} is not closed`)
  const content = scanner.svg.slice(scanner.at, end + close.length)
  scanner.at = end + close.length
  return content
}

function localName(name: string): string {
  return name.slice(name.indexOf(':') + 1).toLowerCase()
}

function checkScriptAttribute({ attribute, element }: AttributeCheck): void {
  const { name, value } = attribute
  if (localName(name).startsWith('on')) {
    throw new SvgError(
      `the attribute ${name} of <${element}> is an event handler, which runs code`
    )
  }
  const url = value.replaceAll(URL_IGNORED, '').toLowerCase()
  if (SCRIPT_URL.test(url)) {
    throw new SvgError(
      `the attribute ${name} of <${element}> is a script URL, which runs code`
    )
  }
}

function checkJsxAttribute({ attribute, element }: AttributeCheck): void {
  const { name } = attribute
  const [prefix = ''] = name.split(':', 1)
  const isSolidNamespace = name.includes(':') && SOLID_NAMESPACES.has(prefix)
  if (!JSX_ATTRIBUTE.test(name) || SOLID_PROPS.has(name) || isSolidNamespace) {
    throw new SvgError(
      `the attribute ${name} of <${element}> is not an attribute in JSX, which reads it as a property or as code; import the icon with ?raw to keep it as text`
    )
  }
}

function checkDuplicates({ attributes, element }: DuplicateCheck): void {
  const names = new Set<string>()
  for (const { name } of attributes) {
    if (names.has(name)) {
      throw malformed(`the attribute ${name} appears twice on <${element}>`)
    }
    names.add(name)
  }
}

function checkElement({ node, isComponent }: CheckInput): void {
  const local = localName(node.name)
  if (local === 'script') {
    throw new SvgError(`the SVG has a <${node.name}> element, which runs code`)
  }
  if (local === 'foreignobject') {
    throw new SvgError(
      `the SVG has a <${node.name}> element, which embeds HTML`
    )
  }
  if (isComponent && !JSX_TAG.test(node.name)) {
    throw new SvgError(
      `the element <${node.name}> is not an element in JSX, which reads a capital letter, a dot or a colon in a tag as code; import the icon with ?raw to keep it as text`
    )
  }
  for (const attribute of node.attributes) {
    checkScriptAttribute({ attribute, element: node.name })
    if (isComponent) checkJsxAttribute({ attribute, element: node.name })
  }
}

// The first value of a repeated attribute of the root wins: the customizer
// writes its attributes before the ones of the file.
function uniqueAttributes(attributes: Attribute[]): Attribute[] {
  const seen = new Set<string>()
  return attributes.filter(({ name }) => {
    if (seen.has(name)) return false
    seen.add(name)
    return true
  })
}

function readTail(scanner: Scanner): void {
  for (;;) {
    skipSpace(scanner)
    if (scanner.at >= scanner.svg.length) return
    const markup = SKIPPED_MARKUP.find(([open]) =>
      scanner.svg.startsWith(open, scanner.at)
    )
    if (!markup) throw malformed('content follows the root element')
    skipMarkup({ scanner, open: markup[0], close: markup[1] })
  }
}

function pushText({ parent, raw }: TextInput): void {
  if (raw === '') return
  if (raw.includes(CDATA_END)) {
    throw malformed(`a "${CDATA_END}" sits outside a CDATA section`)
  }
  parent.children.push({
    kind: 'text',
    raw,
    value: decode(raw),
    isCdata: false
  })
}

function readElement({
  scanner,
  parent,
  isComponent
}: NodeInput): ElementNode | undefined {
  const tag = readStartTag(scanner)
  scanner.at = tag.end
  const node: ElementNode = {
    kind: 'element',
    name: tag.name,
    attributes: tag.attributes,
    children: []
  }
  checkDuplicates({ attributes: tag.attributes, element: tag.name })
  checkElement({ node, isComponent })
  parent.children.push(node)
  return tag.isSelfClosing ? undefined : node
}

function readNode(input: NodeInput): ElementNode | undefined {
  const { scanner, parent } = input
  const { svg, at } = scanner
  if (svg.startsWith(CLOSING_TAG_START, at)) {
    readClosingTag({ scanner, element: parent.name })
    input.open.pop()
    return undefined
  }
  if (svg.startsWith(CDATA_START, at)) {
    const section = skipMarkup({ scanner, open: CDATA_START, close: CDATA_END })
    const value = section.slice(CDATA_START.length, -CDATA_END.length)
    parent.children.push({ kind: 'text', raw: section, value, isCdata: true })
    return undefined
  }
  const skipped = SKIPPED_MARKUP.find(([open]) => svg.startsWith(open, at))
  if (skipped) {
    skipMarkup({ scanner, open: skipped[0], close: skipped[1] })
    return undefined
  }
  if (svg.startsWith('<!', at)) {
    throw malformed('a <! declaration sits inside the root element')
  }
  return readElement(input)
}

// Reads the content of the root element without recursion, so the depth of
// the markup cannot overflow the stack.
function readContent({ scanner, root, isComponent }: ContentInput): void {
  const open: ElementNode[] = [root]
  for (let parent = root; open.length > 0; parent = open.at(-1) ?? root) {
    const next = scanner.svg.indexOf('<', scanner.at)
    if (next === -1) throw malformed(`<${parent.name}> is not closed`)
    pushText({ parent, raw: scanner.svg.slice(scanner.at, next) })
    scanner.at = next
    const child = readNode({ scanner, parent, open, isComponent })
    if (child) open.push(child)
  }
}

function attributeJsx({ name, rawValue, value }: Attribute): string {
  const isLiteral = value === rawValue && !rawValue.includes('"')
  return isLiteral
    ? ` ${name}="${rawValue}"`
    : ` ${name}={${JSON.stringify(value)}}`
}

function textJsx(node: TextNode): string {
  return !node.isCdata && PLAIN_TEXT.test(node.raw)
    ? node.raw
    : `{${JSON.stringify(node.value)}}`
}

function startTagJsx({ node, isRoot }: TagInput): string {
  const attributes = node.attributes.map(attribute => attributeJsx(attribute))
  const props = isRoot ? ' {...props}' : ''
  return `<${node.name}${attributes.join('')}${props}`
}

function nodeJsx({ node, root, pending }: JsxInput): string {
  if (typeof node === 'string') return node
  if (node.kind === 'text') return textJsx(node)
  const start = startTagJsx({ node, isRoot: node === root })
  if (node.children.length === 0) return `${start}/>`
  pending.push(`</${node.name}>`, ...node.children.toReversed())
  return `${start}>`
}

export type ParsedSvg = {
  root: ElementNode
  // The start tag of the root, which a raw import writes again when it
  // drops a repeated attribute.
  rootStart: StartTag
  hasDuplicateRootAttributes: boolean
}

export function isSvgError(error: unknown): error is Error {
  return error instanceof SvgError
}

// The SVG of an icon, read strictly: a markup that does not parse, that runs
// code or that JSX cannot write as it is fails here, not in the compiler.
export function parseSvg({ svg, isComponent }: ParseInput): ParsedSvg {
  if (!svg.startsWith('<svg')) {
    throw new SvgError('the file has no <svg> root element')
  }
  const scanner: Scanner = { svg, at: 0 }
  const rootStart = readStartTag(scanner)
  if (rootStart.name !== 'svg') {
    throw new SvgError('the file has no <svg> root element')
  }
  scanner.at = rootStart.end
  const attributes = uniqueAttributes(rootStart.attributes)
  const root: ElementNode = {
    kind: 'element',
    name: 'svg',
    attributes,
    children: []
  }
  checkElement({ node: root, isComponent })
  if (!rootStart.isSelfClosing) readContent({ scanner, root, isComponent })
  readTail(scanner)
  return {
    root,
    rootStart,
    hasDuplicateRootAttributes:
      attributes.length !== rootStart.attributes.length
  }
}

// The JSX of the root element, with the props spread last so they win over
// the attributes of the file. It walks the markup without recursion.
export function svgJsx(root: ElementNode): string {
  const output: string[] = []
  const pending: (SvgNode | string)[] = [root]
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    output.push(nodeJsx({ node, root, pending }))
  }
  return output.join('')
}

// The SVG text of a raw import: the file as written, with a repeated
// attribute of the root written once.
export function svgText({ svg, parsed }: RawTextInput): string {
  if (!parsed.hasDuplicateRootAttributes) return svg
  const attributes = parsed.root.attributes
    .map(({ name, rawValue, quote }) => ` ${name}=${quote}${rawValue}${quote}`)
    .join('')
  const close = parsed.rootStart.isSelfClosing ? '/>' : '>'
  return `<svg${attributes}${close}${svg.slice(parsed.rootStart.end)}`
}
