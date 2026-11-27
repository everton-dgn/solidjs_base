export function escapeMessageText(text: string): string {
  return text.replaceAll(/[\\{}]/gu, character => `\\${character}`)
}
