type Attribute = {
  name: string
  // The value as the file writes it, between its quotes.
  rawValue: string
  // The value with its character references read.
  value: string
}

type TextNode = {
  kind: 'text'
  raw: string
  value: string
  isCdata: boolean
  // Whether the text is part of what an element draws or holds as text.
  isTextContent: boolean
}

type ElementNode = {
  kind: 'element'
  name: string
  attributes: Attribute[]
  children: SvgNode[]
  drop: DropKind
  // Whether the element is one of TEXT_CONTENT or inside one, where every
  // space of a text draws or belongs to it.
  isTextContent: boolean
}

// Editor data is left out whole: the element that starts it, and what it
// holds.
type DropKind = 'none' | 'whole' | 'inside'

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
type AppendInput = { parent: ElementNode; text: TextNode }
type TextCheck = { parent: ElementNode; value: string }
// The editor data that the icon leaves out, by name, in the order of the
// file.
type Drops = string[]
type ContentInput = {
  scanner: Scanner
  root: ElementNode
  isComponent: boolean
  drops: Drops
}
type AttributeCheck = { attribute: Attribute; element: string }
type DuplicateCheck = { attributes: Attribute[]; element: string }
type CheckInput = {
  node: ElementNode
  parent: ElementNode | undefined
  isComponent: boolean
}
type TagInput = { node: ElementNode; isRoot: boolean }
type ParseInput = { svg: string; isComponent: boolean }
type KeptInput = { attributes: Attribute[]; drops: Drops }
type DropKindInput = { parent: ElementNode; name: string }
type NodeInput = {
  scanner: Scanner
  parent: ElementNode
  open: ElementNode[]
  isComponent: boolean
  drops: Drops
}
type WalkInput = {
  node: SvgNode | string
  root: ElementNode
  pending: (SvgNode | string)[]
}
type NodeWriter = (input: WalkInput) => string
type MarkupInput = { root: ElementNode; write: NodeWriter }
type EscapeInput = { text: string; pattern: RegExp }

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
const DATA_URL = /^data:(?<type>[^,;]*)/u
// WHY: a link opens a data: URL as a page of its own, and <use> reads one as
// a document; an image runs no code, so <image> and <feImage> take the data:
// URL of an image.
const DATA_LINK_ELEMENTS = new Set(['a', 'use'])
const IMAGE_ELEMENTS = new Set(['feImage', 'image'])
const IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp'
])
// The elements of SVG 2 and of its filters and animations, as written in
// SVG. The HTML parser of a page reads some other names, such as <p> or
// <img>, as HTML even inside an <svg>, where they can run code.
const SVG_ELEMENTS = new Set([
  'a',
  'animate',
  'animateMotion',
  'animateTransform',
  'circle',
  'clipPath',
  'defs',
  'desc',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'filter',
  'g',
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'set',
  'stop',
  'style',
  'svg',
  'switch',
  'symbol',
  'text',
  'textPath',
  'title',
  'tspan',
  'use',
  'view'
])
// The namespaces that drawing applications write for themselves, such as
// the layers of Inkscape; nothing in them draws.
const EDITOR_NAMESPACES = new Set([
  'cc',
  'dc',
  'inkscape',
  'rdf',
  'serif',
  'sketch',
  'sodipodi'
])
const METADATA = 'metadata'
const XMLNS_PREFIX = 'xmlns:'
// A browser reads the content of <title> and <desc> in an SVG as HTML, so an
// element there is HTML; the text of <style> is written as it is in the HTML
// of the server, where a "<" could end the element.
const TEXT_ONLY = new Set(['desc', 'style', 'title'])
const UNESCAPED_TEXT = 'style'
// The elements whose texts keep their spaces: what <text> draws, with the
// elements inside it, and the text of <title>, <desc> and <style>.
const TEXT_CONTENT = new Set([
  'desc',
  'style',
  'text',
  'textPath',
  'title',
  'tspan'
])
// WHY: JSX trims a text around its line breaks and joins its spaces, which
// changes the text that an element draws.
const JSX_CHANGED_SPACES = /^\s|\s$|\s\s|[^\S ]/u
const ANIMATED_ATTRIBUTE = 'attributename'
const LINK_ATTRIBUTE = 'href'
const VALUE_LIST = 'values'
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
// The characters that end a value or start markup, and the end of a CDATA
// section, which XML does not accept in text.
const ESCAPED_TEXT = /[&<]|\]\]>/gu
const ESCAPED_VALUE = /[&<"]/gu
const MARKUP_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '"': '&quot;',
  ']]>': ']]&gt;'
}
const CDATA_END = ']]>'
const CLOSING_TAG_START = '</'
const EMPTY_TAG_END = '/>'
// Comments and processing instructions, which the icon leaves out.
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
  return { name, rawValue, value: decode(rawValue) }
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

function urlOf(value: string): string {
  return value.replaceAll(URL_IGNORED, '').toLowerCase()
}

function isScriptUrl(value: string): boolean {
  return SCRIPT_URL.test(urlOf(value))
}

function checkDataUrl({ attribute, element }: AttributeCheck): void {
  const { name, value } = attribute
  if (localName(name) !== LINK_ATTRIBUTE) return
  const type = DATA_URL.exec(urlOf(value))?.groups?.type
  if (type === undefined) return
  if (DATA_LINK_ELEMENTS.has(element)) {
    throw new SvgError(
      `the attribute ${name} of <${element}> is a data: URL, which a page opens as a document of its own`
    )
  }
  if (IMAGE_ELEMENTS.has(element) && !IMAGE_TYPES.has(type)) {
    throw new SvgError(
      `the attribute ${name} of <${element}> is a data: URL of ${type === '' ? 'text' : type}, not of an image: a data: URL here takes the PNG, JPEG, GIF, WebP, AVIF or SVG of an image`
    )
  }
}

function checkScriptAttribute({ attribute, element }: AttributeCheck): void {
  const { name, value } = attribute
  const local = localName(name)
  if (local.startsWith('on')) {
    throw new SvgError(
      `the attribute ${name} of <${element}> is an event handler, which runs code`
    )
  }
  // WHY: an animation of a link can set it to any URL of its values list,
  // whose entries a semicolon separates.
  if (
    local === ANIMATED_ATTRIBUTE &&
    localName(value.trim()) === LINK_ATTRIBUTE
  ) {
    throw new SvgError(
      `the attribute ${name} of <${element}> animates a link, which can set it to a script URL`
    )
  }
  const entries = local === VALUE_LIST ? value.split(';') : [value]
  if (entries.some(entry => isScriptUrl(entry))) {
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

function checkElement({ node, parent, isComponent }: CheckInput): void {
  const local = localName(node.name)
  if (local === 'script') {
    throw new SvgError(`the SVG has a <${node.name}> element, which runs code`)
  }
  if (local === 'foreignobject') {
    throw new SvgError(
      `the SVG has a <${node.name}> element, which embeds HTML`
    )
  }
  if (!SVG_ELEMENTS.has(node.name)) {
    throw new SvgError(
      `the SVG has a <${node.name}> element, which is not an SVG element: a browser can read it as HTML, which can run code`
    )
  }
  if (parent && TEXT_ONLY.has(parent.name)) {
    throw new SvgError(
      `the SVG has a <${node.name}> element inside <${parent.name}>, which holds text only: a browser can read it as HTML, which can run code`
    )
  }
  for (const attribute of node.attributes) {
    checkScriptAttribute({ attribute, element: node.name })
    checkDataUrl({ attribute, element: node.name })
    if (isComponent) checkJsxAttribute({ attribute, element: node.name })
  }
}

function isEditorName(name: string): boolean {
  const colon = name.indexOf(':')
  return colon !== -1 && EDITOR_NAMESPACES.has(name.slice(0, colon))
}

function isEditorAttribute({ name }: Attribute): boolean {
  return (
    isEditorName(name) ||
    (name.startsWith(XMLNS_PREFIX) &&
      EDITOR_NAMESPACES.has(name.slice(XMLNS_PREFIX.length)))
  )
}

function isEditorElement(name: string): boolean {
  return name === METADATA || isEditorName(name)
}

function dropKind({ parent, name }: DropKindInput): DropKind {
  if (parent.drop !== 'none') return 'inside'
  return isEditorElement(name) ? 'whole' : 'none'
}

// The attributes of the file without the ones of an editor, which the icon
// leaves out.
function keptAttributes({ attributes, drops }: KeptInput): Attribute[] {
  return attributes.filter(attribute => {
    if (!isEditorAttribute(attribute)) return true
    drops.push(attribute.name)
    return false
  })
}

// The first value of a repeated attribute of the root wins: the customizer
// writes its attributes before the ones of the file.
function uniqueAttributes(attributes: Attribute[]): Attribute[] {
  const seen = new Set<string>()
  return attributes.filter(attribute => {
    if (seen.has(attribute.name)) return false
    seen.add(attribute.name)
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

function checkText({ parent, value }: TextCheck): void {
  const isChecked = parent.drop === 'none' && parent.name === UNESCAPED_TEXT
  if (!isChecked || !value.includes('<')) {
    return
  }
  throw new SvgError(
    `the text of <${parent.name}> has a "<", which can end the element in the HTML of a page and run code`
  )
}

// WHY: a comment, an instruction, a CDATA section or editor data that the
// icon leaves out splits a text into pieces that the output writes side by
// side. One text keeps them together, so the raw text escapes a "]]>" that
// forms across two of them.
function appendText({ parent, text }: AppendInput): void {
  const last = parent.children.at(-1)
  if (last?.kind !== 'text') {
    parent.children.push(text)
    return
  }
  last.raw += text.raw
  last.value += text.value
  last.isCdata ||= text.isCdata
}

function pushText({ parent, raw }: TextInput): void {
  if (raw === '') return
  if (raw.includes(CDATA_END)) {
    throw malformed(`a "${CDATA_END}" sits outside a CDATA section`)
  }
  const value = decode(raw)
  checkText({ parent, value })
  appendText({
    parent,
    text: {
      kind: 'text',
      raw,
      value,
      isCdata: false,
      isTextContent: parent.isTextContent
    }
  })
}

function readElement({
  scanner,
  parent,
  isComponent,
  drops
}: NodeInput): ElementNode | undefined {
  const tag = readStartTag(scanner)
  scanner.at = tag.end
  checkDuplicates({ attributes: tag.attributes, element: tag.name })
  const drop = dropKind({ parent, name: tag.name })
  const node: ElementNode = {
    kind: 'element',
    name: tag.name,
    attributes:
      drop === 'none'
        ? keptAttributes({ attributes: tag.attributes, drops })
        : tag.attributes,
    children: [],
    drop,
    isTextContent: parent.isTextContent || TEXT_CONTENT.has(tag.name)
  }
  // The content of editor data is left out with it, so it is not checked.
  if (drop !== 'none') {
    if (drop === 'whole') drops.push(`<${tag.name}>`)
    return tag.isSelfClosing ? undefined : node
  }
  checkElement({ node, parent, isComponent })
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
    checkText({ parent, value })
    appendText({
      parent,
      text: {
        kind: 'text',
        raw: section,
        value,
        isCdata: true,
        isTextContent: parent.isTextContent
      }
    })
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
function readContent({
  scanner,
  root,
  isComponent,
  drops
}: ContentInput): void {
  const open: ElementNode[] = [root]
  for (let parent = root; open.length > 0; parent = open.at(-1) ?? root) {
    const next = scanner.svg.indexOf('<', scanner.at)
    if (next === -1) throw malformed(`<${parent.name}> is not closed`)
    pushText({ parent, raw: scanner.svg.slice(scanner.at, next) })
    scanner.at = next
    const child = readNode({ scanner, parent, open, isComponent, drops })
    if (child) open.push(child)
  }
}

function attributeJsx({ name, rawValue, value }: Attribute): string {
  const isLiteral = value === rawValue && !rawValue.includes('"')
  return isLiteral
    ? ` ${name}="${rawValue}"`
    : ` ${name}={${JSON.stringify(value)}}`
}

// A text that JSX reads as it is stays as written; the others, and the
// text of an element whose spaces draw, are a string, which the compiler
// writes into the template as it is and escaped.
function textJsx(node: TextNode): string {
  const isKept =
    !node.isCdata &&
    PLAIN_TEXT.test(node.raw) &&
    !(node.isTextContent && JSX_CHANGED_SPACES.test(node.raw))
  return isKept ? node.raw : `{${JSON.stringify(node.value)}}`
}

function startTagJsx({ node, isRoot }: TagInput): string {
  const attributes = node.attributes.map(attribute => attributeJsx(attribute))
  const props = isRoot ? ' {...props}' : ''
  return `<${node.name}${attributes.join('')}${props}`
}

// The children go on the stack one at a time: an element can have more
// children than a call takes arguments.
function pushChildren({ node, pending }: WalkInput): void {
  if (typeof node === 'string' || node.kind === 'text') return
  pending.push(`</${node.name}>`)
  for (const child of node.children.toReversed()) pending.push(child)
}

function nodeJsx({ node, root, pending }: WalkInput): string {
  if (typeof node === 'string') return node
  if (node.kind === 'text') return textJsx(node)
  const start = startTagJsx({ node, isRoot: node === root })
  if (node.children.length === 0) return `${start}/>`
  pushChildren({ node, root, pending })
  return `${start}>`
}

function escapeMarkup({ text, pattern }: EscapeInput): string {
  return text.replaceAll(pattern, match => MARKUP_ESCAPES[match] ?? match)
}

function nodeText({ node, root, pending }: WalkInput): string {
  if (typeof node === 'string') return node
  if (node.kind === 'text') {
    return escapeMarkup({ text: node.value, pattern: ESCAPED_TEXT })
  }
  const attributes = node.attributes.map(
    ({ name, value }) =>
      ` ${name}="${escapeMarkup({ text: value, pattern: ESCAPED_VALUE })}"`
  )
  const start = `<${node.name}${attributes.join('')}`
  if (node.children.length === 0) return `${start}/>`
  pushChildren({ node, root, pending })
  return `${start}>`
}

// Walks the markup without recursion, so its depth cannot overflow the
// stack.
function writeMarkup({ root, write }: MarkupInput): string {
  const output: string[] = []
  const pending: (SvgNode | string)[] = [root]
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    output.push(write({ node, root, pending }))
  }
  return output.join('')
}

export type ParsedSvg = {
  root: ElementNode
  // The editor data that the icon leaves out, by name, for the warning.
  dropped: string[]
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
  const drops: Drops = []
  const root: ElementNode = {
    kind: 'element',
    name: 'svg',
    attributes: keptAttributes({
      attributes: uniqueAttributes(rootStart.attributes),
      drops
    }),
    children: [],
    drop: 'none',
    isTextContent: false
  }
  checkElement({ node: root, parent: undefined, isComponent })
  if (!rootStart.isSelfClosing) {
    readContent({ scanner, root, isComponent, drops })
  }
  readTail(scanner)
  return { root, dropped: [...new Set(drops)] }
}

// The JSX of the root element, with the props spread last so they win over
// the attributes of the file.
export function svgJsx(root: ElementNode): string {
  return writeMarkup({ root, write: nodeJsx })
}

// WHY: the SVG text of a raw import is written again from what the file
// parses to, as the component is, so no part of the file that the parser
// skips, such as a comment, reaches a page that parses it in another way.
// Comments, processing instructions and what comes before the root are left
// out, and a CDATA section becomes escaped text.
export function svgText(root: ElementNode): string {
  return writeMarkup({ root, write: nodeText })
}
