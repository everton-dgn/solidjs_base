import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { paraglideVitePlugin } from '@inlang/paraglide-js'
import type { Plugin, PluginOption, ViteDevServer } from 'vite-plus'

import { prepareMessages } from '../prepareMessages/index.ts'
import { canContainCatalogs, isCatalogFile } from '../readCatalogs/index.ts'

type ProjectFileOptions = { root: string; file: string }

const PROJECT = './project.inlang'
const PROJECT_FILES = new Set([
  'project.inlang/settings.json',
  'project.inlang/paraglide.config.ts'
])
const PREPARATION_DELAY_MS = 100

function isProjectFile({ root, file }: ProjectFileOptions): boolean {
  const relative = path.relative(root, file).split(path.sep).join('/')
  return PROJECT_FILES.has(relative)
}

function catalogPreparation(): Plugin {
  let root = process.cwd()
  let server: ViteDevServer | undefined
  let failure: Error | undefined
  let pendingPreparation: Promise<void> | undefined
  let requested = 0
  let isRunning = false
  const prepare = async () => {
    try {
      await prepareMessages(root)
      if (!failure) return
      failure = undefined
      // Identical aggregates trigger no compilation or HMR; a reload clears
      // the error overlay.
      server?.ws.send({ type: 'full-reload' })
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error))
      server?.ws.send({
        type: 'error',
        err: { message: failure.message, stack: failure.stack ?? '' }
      })
    }
  }
  const prepareRequested = async () => {
    isRunning = true
    try {
      let handled = 0
      while (handled < requested) {
        handled = requested
        await delay(PREPARATION_DELAY_MS)
        if (handled < requested) continue
        await prepare()
      }
    } finally {
      isRunning = false
    }
  }
  const request = () => {
    requested += 1
    if (!isRunning) pendingPreparation = prepareRequested()
  }
  const schedule = () => {
    request()
    return pendingPreparation
  }
  // Chokidar scans new directories before watching them, missing files created
  // in between. Reconcile catalogs when directories appear or disappear.
  const reconcile = (directory: string) => {
    if (canContainCatalogs({ root, file: directory })) request()
  }
  return {
    name: 'project:i18n-catalogs',
    enforce: 'pre',
    async configResolved(config) {
      ;({ root } = config)
      await prepareMessages(root)
    },
    configureServer(devServer) {
      server = devServer
      devServer.watcher.on('addDir', reconcile)
      devServer.watcher.on('unlinkDir', reconcile)
      // Invalid catalogs must block responses, including a full browser reload.
      // oxlint-disable-next-line eslint/max-params -- Connect middleware receives three arguments.
      devServer.middlewares.use((_request, response, next) => {
        if (!failure) {
          next()
          return
        }
        const internalServerError = 500
        response.statusCode = internalServerError
        response.setHeader('Content-Type', 'text/plain; charset=utf-8')
        response.end(failure.message)
      })
    },
    // Exclude generated files to avoid scheduling another preparation.
    watchChange: {
      // The official plugin also reads the config and must wait for this event.
      sequential: true,
      handler(file) {
        const shouldPrepare =
          isProjectFile({ root, file }) || isCatalogFile({ root, file })
        return shouldPrepare ? schedule() : undefined
      }
    },
    closeServer() {
      return pendingPreparation
    }
  }
}

export function i18nPlugin(): PluginOption[] {
  return [
    catalogPreparation(),
    paraglideVitePlugin({ project: PROJECT, devErrorResponse: true })
  ]
}
