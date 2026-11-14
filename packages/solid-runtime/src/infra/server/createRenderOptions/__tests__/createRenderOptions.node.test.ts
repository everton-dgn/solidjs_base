import {
  createRequestEvent,
  renderToStream,
  ssr,
  type RequestEvent
} from '@solidjs/web'
import { provideRequestEvent } from '@solidjs/web/storage'

import { configureServerErrors } from '../../configureServerErrors/index.ts'
import { createRenderOptions } from '../index.ts'

function publicPage() {
  return ssr('<main>public</main>')
}

describe('render entry options', () => {
  it('registers integrity before rendering and completes it through the native callback', async () => {
    configureServerErrors()
    const event: RequestEvent = createRequestEvent(
      new Request('http://localhost')
    )
    event.nonce = { script: 'script-nonce', style: 'style-nonce' }
    await provideRequestEvent(event, async () => {
      const options = createRenderOptions()
      expect(options.nonce).toBe(event.nonce)
      expect(options.signal).toBe(event.request.signal)
      expect(options).not.toHaveProperty('onError')
      expect(event.locals.ssrRenderState).toStrictEqual({
        hasErrors: false,
        hasCompleted: false
      })
      await renderToStream(publicPage, options)
      expect(event.locals.ssrRenderState).toStrictEqual({
        hasErrors: false,
        hasCompleted: true
      })
    })
  })

  it('keeps native cancellation identity and does not complete an abandoned render', async () => {
    const controller = new AbortController()
    const event: RequestEvent = createRequestEvent(
      new Request('http://localhost', { signal: controller.signal })
    )
    const reason = new Error('PRIVATE_ABORT')
    controller.abort(reason)
    await provideRequestEvent(event, async () => {
      const rendered = renderToStream(publicPage, createRenderOptions())
      await expect(Promise.resolve(rendered)).rejects.toBe(reason)
      expect(event.locals.ssrRenderState?.hasCompleted).toBe(false)
    })
  })

  it('supports rendering without a request context', () => {
    const options = createRenderOptions()
    expect(options.nonce).toBeUndefined()
    expect(options.signal).toBeUndefined()
    expect(options.onCompleteAll).toBeTypeOf('function')
  })
})
