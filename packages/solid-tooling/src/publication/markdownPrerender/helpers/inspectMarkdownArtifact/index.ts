import type { PrerenderRoute } from 'nitro/types'

import { readRouteBytes } from '../artifactDigest/index.ts'

// A complete HTML envelope indicates HTML served as Markdown. Quoted tags and
// code blocks inside a document do not enclose its entire body.
const HTML_DOCUMENT_START = /^\s*(?:<!doctype\s+html\b|<html[\s>])/iu
const HTML_DOCUMENT_END = /<\/html>\s*$/iu
const MARKDOWN_TYPE = 'text/markdown'
const UTF8_CHARSET = 'charset=utf-8'

// Nitro infers text/markdown without a charset for undeclared types, including
// empty redirects. The converter always declares UTF-8.
function isMarkdownUtf8(contentType: string | undefined): boolean {
  const [type, ...parameters] = (contentType ?? '')
    .split(';')
    .map(part => part.trim().toLowerCase().replaceAll('"', ''))
  return type === MARKDOWN_TYPE && parameters.includes(UTF8_CHARSET)
}

// Return the artifact problem, or undefined for publishable Markdown.
export function inspectMarkdownArtifact(
  route: PrerenderRoute
): string | undefined {
  if (route.fileName !== route.route) {
    return `written as ${route.fileName ?? 'no file'}`
  }
  if (!route.contentType) return 'served as no content type'
  if (!isMarkdownUtf8(route.contentType)) {
    return `served as ${route.contentType}`
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(
      readRouteBytes(route)
    )
  } catch {
    return 'invalid UTF-8 body'
  }
  if (!text.trim()) return 'empty body'
  if (HTML_DOCUMENT_START.test(text) && HTML_DOCUMENT_END.test(text)) {
    return 'HTML document body'
  }
  return undefined
}
