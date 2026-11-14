import { isTheme } from '../isTheme/index.ts'
import { makeBroadcastChannel } from '../makeBroadcastChannel/index.ts'
import { readTheme } from '../themeStorage/index.ts'
import type { Theme, ThemeOptions } from '../types.ts'

type ThemeMessage = {
  theme: Theme
  isPersisted: boolean
  changedAt: number
  origin: string
}

type ThemeChoice = {
  theme: Theme
  isPersisted: boolean
}

type ThemeConnection = {
  publish: (choice: ThemeChoice) => void
  dispose: () => void
}

const ORIGIN_WORDS = 4

function isThemeMessage(message: unknown): message is ThemeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'theme' in message &&
    isTheme(message.theme) &&
    'isPersisted' in message &&
    typeof message.isPersisted === 'boolean' &&
    'changedAt' in message &&
    typeof message.changedAt === 'number' &&
    Number.isSafeInteger(message.changedAt) &&
    message.changedAt > 0 &&
    'origin' in message &&
    typeof message.origin === 'string' &&
    message.origin.length > 0
  )
}

export function makeThemeChannel(
  options: ThemeOptions,
  receive: (theme: Theme) => void
): ThemeConnection {
  let isTemporary = false
  let observed: Theme | null | undefined
  const origin = crypto.getRandomValues(new Uint32Array(ORIGIN_WORDS)).join('-')
  let changedAt = 0
  let lastOrigin = ''

  const restore = (): void => {
    const saved = readTheme(options)
    if (saved === undefined) return
    if (!isTemporary || saved !== observed) {
      isTemporary = false
      receive(saved ?? options.defaultTheme)
    }
    observed = saved
  }

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') restore()
  }

  const onMessage = (message: unknown): void => {
    if (!isThemeMessage(message)) return
    if (
      message.changedAt < changedAt ||
      (message.changedAt === changedAt && message.origin <= lastOrigin)
    ) {
      if (message.isPersisted) restore()
      return
    }
    ;({ changedAt } = message)
    lastOrigin = message.origin
    isTemporary = !message.isPersisted
    observed = readTheme(options)
    receive(
      message.isPersisted && observed !== undefined
        ? (observed ?? options.defaultTheme)
        : message.theme
    )
  }

  const channel = makeBroadcastChannel<ThemeMessage>({
    name: options.cookieName,
    receive: onMessage
  })
  globalThis.addEventListener('focus', restore)
  globalThis.addEventListener('pageshow', restore)
  document.addEventListener('visibilitychange', onVisible)
  restore()

  return {
    publish({ theme, isPersisted }) {
      changedAt = Math.max(Date.now(), changedAt + 1)
      lastOrigin = origin
      isTemporary = !isPersisted
      observed = readTheme(options)
      channel.post({ theme, isPersisted, changedAt, origin })
    },
    dispose() {
      channel.dispose()
      globalThis.removeEventListener('focus', restore)
      globalThis.removeEventListener('pageshow', restore)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}
