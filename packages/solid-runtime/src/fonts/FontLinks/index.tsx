import { For } from 'solid-js'
import { preloads, stylesheet } from 'virtual:solid-app/fonts'

export function FontLinks() {
  return (
    <>
      <link rel="stylesheet" href={stylesheet} />
      <For each={preloads}>
        {font => (
          <link
            rel="preload"
            href={font.href}
            as="font"
            type={font.type}
            crossorigin="anonymous"
          />
        )}
      </For>
    </>
  )
}
