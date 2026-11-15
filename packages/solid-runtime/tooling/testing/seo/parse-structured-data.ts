import * as v from 'valibot'

const NodeSchema = v.record(v.string(), v.unknown())
const StructuredDataSchema = v.object({
  '@context': v.string(),
  '@graph': v.array(NodeSchema)
})

export type StructuredData = v.InferOutput<typeof StructuredDataSchema>

// Reads JSON-LD from `<script type="application/ld+json">` and validates
// the graph structure; each test checks the relevant nodes.
export function parseStructuredData(json: string | null): StructuredData {
  return v.parse(StructuredDataSchema, JSON.parse(json ?? 'null'))
}
