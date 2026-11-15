// WHY: a ?raw import matches both patterns, which share the same prefix, and
// TypeScript takes the one declared first.
declare module 'icon:*?raw' {
  const svg: string
  export default svg
}

declare module 'icon:*' {
  import type { ComponentProps, JSX } from '@solidjs/web'

  const Icon: (props: ComponentProps<'svg'>) => JSX.Element
  export default Icon
}
