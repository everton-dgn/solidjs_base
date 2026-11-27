// WHY: The question gives the size and the wrap it reads with Clack, so the CLI loads Clack only once a question opens.
export type Followed = {
  draw: () => string
  rows: () => number
  columns: () => number
  wrap: (text: string) => string
}
export type Follow = (followed?: Followed) => void
