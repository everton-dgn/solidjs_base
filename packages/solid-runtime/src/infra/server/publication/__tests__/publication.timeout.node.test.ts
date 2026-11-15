import { HTTP_OK } from '#solid-runtime/http/constants.ts'

import { createPublicationController } from '../index.ts'

const MAX_TIMEOUT_MS = 2_147_483_647
const SOURCE_DELAY_MS = 20

function delayedResponse(): Promise<Response> {
  const producer = Promise.withResolvers<Response>()
  setTimeout(() => producer.resolve(new Response(null)), SOURCE_DELAY_MS)
  return producer.promise
}

describe('publication timer range', () => {
  it('rejects an overflowing timeout before starting a producer or reserving capacity', async () => {
    const publication = createPublicationController()
    const run = vi.fn<() => Promise<Response>>(delayedResponse)
    try {
      await expect(
        publication.runPublication({
          kind: 'sitemap',
          timeoutMs: MAX_TIMEOUT_MS + 1,
          maxOutputBytes: 1,
          run
        })
      ).rejects.toThrow(
        'Publication timeout must be an integer between 1 and 2147483647 milliseconds'
      )
      expect(run).not.toHaveBeenCalled()
      expect(publication.getMetrics()).toMatchObject({
        active: 0,
        outputs: 0,
        reservedBytes: 0,
        timedOut: 0
      })
    } finally {
      await run.mock.results[0]?.value
    }
  })

  it('accepts the maximum timer delay without timing out a 20 ms producer', async () => {
    const publication = createPublicationController()
    const response = await publication.runPublication({
      kind: 'sitemap',
      timeoutMs: MAX_TIMEOUT_MS,
      maxOutputBytes: 1,
      run: delayedResponse
    })
    expect(response.status).toBe(HTTP_OK)
    expect(publication.getMetrics()).toMatchObject({
      active: 0,
      outputs: 0,
      reservedBytes: 0,
      timedOut: 0
    })
  })
})
