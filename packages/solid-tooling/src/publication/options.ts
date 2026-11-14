import * as v from 'valibot'

import {
  LLMS_FULL_MAX_BYTES,
  LLMS_MAX_BYTES,
  MARKDOWN_TIMEOUT_MS,
  MAX_HTML_BYTES,
  MAX_MARKDOWN_BYTES
} from './protocol.ts'

const BudgetSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(Number.MAX_SAFE_INTEGER)
)
const MAX_TIMEOUT_MS = 2_147_483_647
const TimeoutSchema = v.pipe(BudgetSchema, v.maxValue(MAX_TIMEOUT_MS))

export const MarkdownSchema = v.strictObject({
  static: v.optional(v.boolean(), false),
  maxInputBytes: v.optional(BudgetSchema, MAX_HTML_BYTES),
  maxOutputBytes: v.optional(BudgetSchema, MAX_MARKDOWN_BYTES),
  timeoutMs: v.optional(TimeoutSchema, MARKDOWN_TIMEOUT_MS)
})
export const LlmsSchema = v.strictObject({
  maxBytes: v.optional(BudgetSchema, LLMS_MAX_BYTES)
})
export const LlmsFullSchema = v.strictObject({
  maxBytes: v.optional(BudgetSchema, LLMS_FULL_MAX_BYTES)
})
export const SitemapSchema = v.union([
  v.boolean(),
  v.strictObject({ static: v.literal(true) })
])

export type MarkdownOptions = v.InferInput<typeof MarkdownSchema>
export type LlmsOptions = v.InferInput<typeof LlmsSchema>
export type LlmsFullOptions = v.InferInput<typeof LlmsFullSchema>
export type PublicationFeatures = {
  markdown?: false | MarkdownOptions
  llms?: false | LlmsOptions
  llmsFull?: false | LlmsFullOptions
  sitemap?: v.InferInput<typeof SitemapSchema>
}

export function validatePublicationFeatures(
  options: PublicationFeatures
): void {
  if (
    typeof options.llmsFull === 'object' &&
    (typeof options.llms !== 'object' ||
      typeof options.markdown !== 'object' ||
      options.markdown.static !== true)
  ) {
    throw new Error('seo.llmsFull requires seo.llms and seo.markdown.static')
  }
}
