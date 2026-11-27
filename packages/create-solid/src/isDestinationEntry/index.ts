const metadata = new Set(['.DS_Store', 'Thumbs.db', '.git'])

export function isDestinationEntry(name: string): boolean {
  return !metadata.has(name)
}
