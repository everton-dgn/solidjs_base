import { createRobots } from '../index.ts'

describe('robots response factory', () => {
  it('returns independent response bodies and defaults to no-store in development', async () => {
    vi.stubEnv('PROD', false)
    const get = createRobots({ groups: [{ userAgents: ['*'], allow: ['/'] }] })
    const first = get()
    expect(first.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(first.headers.get('cache-control')).toBe('no-store')
    await expect(first.text()).resolves.toBe('User-agent: *\nAllow: /\n')
    await expect(get().text()).resolves.toBe('User-agent: *\nAllow: /\n')
  })

  it('memoizes production text and retains the existing shared-cache policy', async () => {
    vi.stubEnv('PROD', true)
    const groups = [{ userAgents: ['Bot'] }]
    const get = createRobots({
      groups,
      sitemaps: ['https://example.com/sitemap.xml']
    })
    const first = get()
    expect(first.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=3600, stale-if-error=86400'
    )
    groups[0]?.userAgents.push('Later')
    await expect(get().text()).resolves.toBe(await first.text())
  })

  it('reads changes in development and accepts an explicit cache policy', async () => {
    vi.stubEnv('PROD', false)
    const groups = [{ userAgents: ['Bot'] }]
    const get = createRobots({ groups, cacheControl: 'private, no-store' })
    expect(get().headers.get('cache-control')).toBe('private, no-store')
    groups[0]?.userAgents.push('Later')
    await expect(get().text()).resolves.toBe(
      'User-agent: Bot\nUser-agent: Later\n'
    )
  })
})
