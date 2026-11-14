// Escape before useHead so initial HTML, streamed updates and client updates
// share the same JSON text without depending on an HTML serializer's policy.
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data)
    .replaceAll('<', String.raw`\u003c`)
    .replaceAll('\u2028', String.raw`\u2028`)
    .replaceAll('\u2029', String.raw`\u2029`)
}
